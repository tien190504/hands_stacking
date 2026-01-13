/**
 * JARVIS AR - HUD Module
 * 3D head-tracking HUD cluster with waveforms and scrolling text
 */

import * as THREE from 'three';

let hudGroup = null;
let hudRings = [];
let waveformCanvas = null;
let waveformCtx = null;
let time = 0;

// HUD settings
const HUD_OFFSET_X = 0.3;   // Offset to right of face
const HUD_SCALE = 0.8;      // Overall scale
const SMOOTHING = 0.1;      // Position smoothing factor

// Current position (for smoothing)
let currentHUDPosition = { x: 0, y: 0, z: -2 };

/**
 * Create the 3D HUD cluster
 * @param {THREE.Scene} scene - Three.js scene
 * @returns {THREE.Group} The HUD group
 */
export function createHUD3D(scene) {
    hudGroup = new THREE.Group();
    hudGroup.name = 'HUD';

    // Create materials
    const ringMaterial = new THREE.LineBasicMaterial({
        color: 0x00D4FF,
        transparent: true,
        opacity: 0.6
    });

    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x00D4FF,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide
    });

    // Create concentric rings
    const ringRadii = [0.15, 0.2, 0.28];
    ringRadii.forEach((radius, index) => {
        const ringGeo = new THREE.RingGeometry(radius - 0.005, radius, 64);
        const ringEdges = new THREE.EdgesGeometry(ringGeo);
        const ring = new THREE.LineSegments(ringEdges, ringMaterial.clone());
        ring.rotation.x = Math.PI * 0.1 * (index - 1);
        ring.rotation.y = Math.PI * 0.15 * index;
        hudRings.push(ring);
        hudGroup.add(ring);
    });

    // Create arc segments
    for (let i = 0; i < 4; i++) {
        const arc = createArcSegment(0.32, Math.PI / 6, ringMaterial.clone());
        arc.rotation.z = (Math.PI / 2) * i + Math.PI / 4;
        hudGroup.add(arc);
    }

    // Create data lines (vertical indicators)
    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 / 8) * i;
        const line = createDataLine(0.35, 0.45);
        line.rotation.z = angle;
        hudGroup.add(line);
    }

    // Create center hexagon
    const hexGeo = createHexagonGeometry(0.05);
    const hexLine = new THREE.LineLoop(hexGeo, ringMaterial.clone());
    hudGroup.add(hexLine);

    // Add glow sphere at center
    const glowGeo = new THREE.SphereGeometry(0.03, 16, 16);
    const glowSphere = new THREE.Mesh(glowGeo, glowMaterial.clone());
    hudGroup.add(glowSphere);

    // Scale the group
    hudGroup.scale.setScalar(HUD_SCALE);

    scene.add(hudGroup);

    return hudGroup;
}

/**
 * Create an arc segment
 */
function createArcSegment(radius, angleSpan, material) {
    const points = [];
    const segments = 20;

    for (let i = 0; i <= segments; i++) {
        const angle = -angleSpan / 2 + (angleSpan * i / segments);
        points.push(new THREE.Vector3(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            0
        ));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geometry, material);
}

/**
 * Create a data line indicator
 */
function createDataLine(innerRadius, outerRadius) {
    const points = [
        new THREE.Vector3(innerRadius, 0, 0),
        new THREE.Vector3(outerRadius, 0, 0)
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: 0x00D4FF,
        transparent: true,
        opacity: 0.4
    });

    return new THREE.Line(geometry, material);
}

/**
 * Create hexagon geometry
 */
function createHexagonGeometry(radius) {
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        points.push(new THREE.Vector3(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            0
        ));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
}

/**
 * Update HUD position based on face tracking
 * @param {Object} facePosition - Normalized face position {x, y, z}
 * @param {THREE.Camera} camera - Three.js camera
 */
export function updateHUDPosition(facePosition, camera) {
    if (!hudGroup) return;

    if (facePosition) {
        // Convert normalized coords to world space
        // Face position is 0-1, we need to convert to camera view space
        const targetX = ((1 - facePosition.x) - 0.5) * 4 + HUD_OFFSET_X; // Offset right
        const targetY = (0.5 - facePosition.y) * 3;
        const targetZ = -2 + (facePosition.z * 2);

        // Smooth interpolation
        currentHUDPosition.x += (targetX - currentHUDPosition.x) * SMOOTHING;
        currentHUDPosition.y += (targetY - currentHUDPosition.y) * SMOOTHING;
        currentHUDPosition.z += (targetZ - currentHUDPosition.z) * SMOOTHING;
    }

    hudGroup.position.set(
        currentHUDPosition.x,
        currentHUDPosition.y,
        currentHUDPosition.z
    );

    // Always face camera
    hudGroup.lookAt(camera.position);
}

/**
 * Animate the HUD elements
 * @param {number} deltaTime - Time since last frame
 */
export function animateHUD(deltaTime) {
    if (!hudGroup) return;

    time += deltaTime;

    // Rotate rings
    hudRings.forEach((ring, index) => {
        ring.rotation.z += deltaTime * (0.2 + index * 0.1) * (index % 2 === 0 ? 1 : -1);
    });

    // Pulse opacity
    hudGroup.children.forEach((child, index) => {
        if (child.material && child.material.opacity !== undefined) {
            const baseOpacity = child.material.userData?.baseOpacity || child.material.opacity;
            if (!child.material.userData) child.material.userData = {};
            child.material.userData.baseOpacity = baseOpacity;

            child.material.opacity = baseOpacity * (0.7 + 0.3 * Math.sin(time * 2 + index));
        }
    });
}

/**
 * Initialize 2D waveform canvas
 */
export function initWaveform() {
    waveformCanvas = document.getElementById('waveform-canvas');
    if (waveformCanvas) {
        waveformCtx = waveformCanvas.getContext('2d');
    }
}

/**
 * Animate the waveform display
 */
export function animateWaveform() {
    if (!waveformCtx || !waveformCanvas) return;

    const width = waveformCanvas.width;
    const height = waveformCanvas.height;

    // Clear
    waveformCtx.fillStyle = 'rgba(0, 8, 16, 0.3)';
    waveformCtx.fillRect(0, 0, width, height);

    // Draw multiple waveforms
    const waves = [
        { freq: 0.02, amp: 15, phase: 0, color: 'rgba(0, 212, 255, 0.8)' },
        { freq: 0.04, amp: 8, phase: Math.PI / 3, color: 'rgba(0, 212, 255, 0.4)' },
        { freq: 0.01, amp: 20, phase: Math.PI, color: 'rgba(0, 136, 170, 0.6)' }
    ];

    waves.forEach(wave => {
        waveformCtx.strokeStyle = wave.color;
        waveformCtx.lineWidth = 1.5;
        waveformCtx.beginPath();

        for (let x = 0; x < width; x++) {
            const y = height / 2 +
                Math.sin((x * wave.freq) + (time * 3) + wave.phase) * wave.amp +
                Math.sin((x * wave.freq * 2.5) + (time * 2)) * (wave.amp * 0.3);

            if (x === 0) {
                waveformCtx.moveTo(x, y);
            } else {
                waveformCtx.lineTo(x, y);
            }
        }

        waveformCtx.stroke();
    });

    // Add glow effect
    waveformCtx.shadowBlur = 10;
    waveformCtx.shadowColor = '#00D4FF';
}

/**
 * Update status displays
 * @param {boolean} faceDetected - Is face detected
 * @param {number} handsDetected - Number of hands detected
 * @param {string} gestureName - Current gesture name
 * @param {string} earthMode - Earth mode (SINGLE/DUAL/MERGING)
 */
export function updateStatusDisplays(faceDetected, handsDetected, gestureName, earthMode) {
    const faceStatus = document.getElementById('face-status');
    const handStatus = document.getElementById('hand-status');
    const gestureLabel = document.querySelector('.gesture-label');
    const earthModeEl = document.getElementById('earth-mode');

    if (faceStatus) {
        faceStatus.textContent = faceDetected ? 'LOCKED' : 'SCANNING';
        faceStatus.classList.toggle('online', faceDetected);
    }

    if (handStatus) {
        handStatus.textContent = handsDetected > 0 ? `${handsDetected} DETECTED` : 'SCANNING';
        handStatus.classList.toggle('online', handsDetected > 0);
    }

    if (gestureLabel) {
        gestureLabel.textContent = gestureName;
    }

    if (earthModeEl) {
        earthModeEl.textContent = earthMode;
    }
}

/**
 * Show/hide loading screen
 * @param {boolean} show
 */
export function setLoadingScreen(show) {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        if (show) {
            loadingScreen.classList.remove('hidden');
        } else {
            loadingScreen.classList.add('hidden');
        }
    }
}
