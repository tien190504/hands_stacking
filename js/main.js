/**
 * JARVIS AR - Main Orchestration Module
 * Initializes all systems and runs the main animation loop
 */

import * as THREE from 'three';

import { initCamera, setupARBackground, isCameraReady, getVideoElement } from './camera.js';
import { initMediaPipe, processFrame, getFacePosition, getHand, isMediaPipeReady } from './mediapipe.js';
import { getGestureState, getGestureName } from './gestures.js';
import { createHUD3D, updateHUDPosition, animateHUD, initWaveform, animateWaveform, updateStatusDisplays, setLoadingScreen } from './hud.js';
import {
    initEarth, updateEarth, handlePinchZoom, handleWaveRotation,
    spawnDualEarths, mergeEarths, disperseParticles, convergeParticles,
    getEarthMode, isDualEarthMode, getLeftEarth, getRightEarth
} from './earth.js';

// Three.js globals
let scene, camera, renderer;
let clock;
let textureLoader;
let backgroundPlane;

// State
let isInitialized = false;
let previousGestureState = {};
let previousPinchDistance = 0;
let dualEarthCooldown = 0;

/**
 * Initialize Three.js scene
 */
function initThreeJS() {
    // Scene
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.z = 0;

    // Renderer
    const canvas = document.getElementById('three-canvas');
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    // Clock
    clock = new THREE.Clock();

    // Texture loader
    textureLoader = new THREE.TextureLoader();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    const blueLight = new THREE.PointLight(0x00D4FF, 1, 10);
    blueLight.position.set(-2, 2, 2);
    scene.add(blueLight);

    // Handle resize
    window.addEventListener('resize', onWindowResize);

    console.log('[JARVIS] Three.js initialized');
}

/**
 * Handle window resize
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Initialize all systems
 */
async function init() {
    console.log('[JARVIS] Initializing systems...');

    try {
        // Initialize Three.js first
        initThreeJS();

        // Initialize camera
        const videoElement = await initCamera();
        console.log('[JARVIS] Camera ready');

        // Setup AR background
        backgroundPlane = setupARBackground(scene, camera);

        // Initialize MediaPipe
        await initMediaPipe(videoElement);
        console.log('[JARVIS] MediaPipe ready');

        // Initialize HUD
        createHUD3D(scene);
        initWaveform();
        console.log('[JARVIS] HUD ready');

        // Initialize Earth
        initEarth(scene, textureLoader);
        console.log('[JARVIS] Earth ready');

        // Hide loading screen
        setTimeout(() => {
            setLoadingScreen(false);
        }, 500);

        isInitialized = true;
        console.log('[JARVIS] All systems online');

        // Start animation loop
        animate();

    } catch (error) {
        console.error('[JARVIS] Initialization failed:', error);

        // Show error message
        const loadingText = document.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = 'Camera access required. Please allow camera permissions.';
            loadingText.style.color = '#FF4444';
        }
    }
}

/**
 * Process gestures and control Earth
 */
function processGestures() {
    const leftHand = getHand('Left');
    const rightHand = getHand('Right');

    const gestureState = getGestureState(leftHand, rightHand, previousGestureState);
    const gestureName = getGestureName(gestureState);

    // Count detected hands
    let handsCount = 0;
    if (gestureState.left.detected) handsCount++;
    if (gestureState.right.detected) handsCount++;

    // DUAL EARTH MODE: When two hands are detected, spawn two Earths
    if (gestureState.bothHands.detected && !isDualEarthMode()) {
        if (dualEarthCooldown <= 0) {
            spawnDualEarths(scene, textureLoader);
            dualEarthCooldown = 90; // Cooldown frames
        }
    }
    dualEarthCooldown = Math.max(0, dualEarthCooldown - 1);

    // SINGLE EARTH MODE
    if (!isDualEarthMode()) {
        const mainEarth = scene.getObjectByName('mainEarth');

        // FIST/GRASP = CONVERGE particles
        if (gestureState.left.grasping || gestureState.right.grasping) {
            if (mainEarth) convergeParticles(mainEarth, 0.8);
        }

        // OPEN HAND = DISPERSE particles
        if (gestureState.left.open || gestureState.right.open) {
            if (mainEarth) disperseParticles(mainEarth, 0.5);
        }

        // Pinch zoom
        if (gestureState.left.pinch.isPinching || gestureState.right.pinch.isPinching) {
            const currentPinch = gestureState.left.pinch.isPinching
                ? gestureState.left.pinch.distance
                : gestureState.right.pinch.distance;

            if (previousPinchDistance > 0) {
                handlePinchZoom(currentPinch, previousPinchDistance);
            }
            previousPinchDistance = currentPinch;
        } else {
            previousPinchDistance = 0;
        }

        // Wave rotation
        if (gestureState.left.wave.isWaving) {
            handleWaveRotation(gestureState.left.wave.velocity, -gestureState.left.wave.direction);
        }
        if (gestureState.right.wave.isWaving) {
            handleWaveRotation(gestureState.right.wave.velocity, -gestureState.right.wave.direction);
        }
    }
    // DUAL EARTH MODE
    else {
        const leftEarth = getLeftEarth();
        const rightEarth = getRightEarth();

        // LEFT HAND controls LEFT EARTH
        if (gestureState.left.detected && leftEarth) {
            if (gestureState.left.grasping) {
                convergeParticles(leftEarth, 0.8);
            }
            if (gestureState.left.open) {
                disperseParticles(leftEarth, 0.5);
            }
            if (gestureState.left.wave.isWaving) {
                leftEarth.rotation.y += gestureState.left.wave.velocity * 0.15;
            }
        }

        // RIGHT HAND controls RIGHT EARTH
        if (gestureState.right.detected && rightEarth) {
            if (gestureState.right.grasping) {
                convergeParticles(rightEarth, 0.8);
            }
            if (gestureState.right.open) {
                disperseParticles(rightEarth, 0.5);
            }
            if (gestureState.right.wave.isWaving) {
                rightEarth.rotation.y += gestureState.right.wave.velocity * 0.15;
            }
        }

        // CLASPED HANDS (both fists together) = MERGE EARTHS
        if (gestureState.bothHands.grasping) {
            mergeEarths(scene);
        }

        // When only one hand is detected, merge back to single Earth
        if (!gestureState.bothHands.detected && (gestureState.left.detected || gestureState.right.detected)) {
            // After cooldown, merge Earths
            if (dualEarthCooldown <= 0) {
                mergeEarths(scene);
            }
        }
    }

    // Update status displays
    const facePosition = getFacePosition();
    updateStatusDisplays(!!facePosition, handsCount, gestureName, getEarthMode());

    previousGestureState = gestureState;
}

/**
 * Main animation loop
 */
function animate() {
    requestAnimationFrame(animate);

    if (!isInitialized) return;

    const deltaTime = clock.getDelta();

    // Process MediaPipe frame
    if (isMediaPipeReady() && isCameraReady()) {
        processFrame(getVideoElement());
    }

    // Update HUD position based on face tracking
    const facePosition = getFacePosition();
    updateHUDPosition(facePosition, camera);
    animateHUD(deltaTime);
    animateWaveform();

    // Process gestures and control Earth
    processGestures();

    // Update Earth animation
    updateEarth(deltaTime);

    // Render
    renderer.render(scene, camera);
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
