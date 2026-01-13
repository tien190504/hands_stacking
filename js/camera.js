/**
 * JARVIS AR - Camera Module
 * Handles webcam capture and AR background layer
 */

import * as THREE from 'three';

let videoElement = null;
let videoStream = null;
let isInitialized = false;

/**
 * Initialize webcam capture
 * @returns {Promise<HTMLVideoElement>} The video element with camera feed
 */
export async function initCamera() {
    videoElement = document.getElementById('webcam');

    if (!videoElement) {
        throw new Error('Webcam video element not found');
    }

    const constraints = {
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'user',
            frameRate: { ideal: 30, max: 60 }
        },
        audio: false
    };

    try {
        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = videoStream;

        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve();
            };
        });

        isInitialized = true;
        console.log('[JARVIS] Camera initialized:', videoElement.videoWidth, 'x', videoElement.videoHeight);
        return videoElement;

    } catch (error) {
        console.error('[JARVIS] Camera initialization failed:', error);
        throw error;
    }
}

/**
 * Create a Three.js VideoTexture from webcam
 * @returns {THREE.VideoTexture} Video texture for 3D rendering
 */
export function createVideoTexture() {
    if (!videoElement || !isInitialized) {
        throw new Error('Camera not initialized');
    }

    const texture = new THREE.VideoTexture(videoElement);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;
    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}

/**
 * Setup fullscreen AR background plane
 * @param {THREE.Scene} scene - Three.js scene
 * @param {THREE.Camera} camera - Three.js camera
 * @returns {THREE.Mesh} The background plane mesh
 */
export function setupARBackground(scene, camera) {
    const videoTexture = createVideoTexture();

    // Calculate plane size to cover entire viewport
    const distance = 10; // Distance from camera
    const vFov = camera.fov * Math.PI / 180;
    const planeHeight = 2 * Math.tan(vFov / 2) * distance;
    const planeWidth = planeHeight * camera.aspect;

    const geometry = new THREE.PlaneGeometry(planeWidth * 1.2, planeHeight * 1.2);
    const material = new THREE.MeshBasicMaterial({
        map: videoTexture,
        side: THREE.FrontSide,
        depthWrite: false
    });

    const backgroundPlane = new THREE.Mesh(geometry, material);
    backgroundPlane.position.z = -distance;
    backgroundPlane.scale.x = -1; // Mirror for selfie view
    backgroundPlane.renderOrder = -1;

    scene.add(backgroundPlane);

    return backgroundPlane;
}

/**
 * Update background plane on window resize
 * @param {THREE.Mesh} backgroundPlane - The background plane mesh
 * @param {THREE.Camera} camera - Three.js camera
 */
export function updateARBackground(backgroundPlane, camera) {
    const distance = 10;
    const vFov = camera.fov * Math.PI / 180;
    const planeHeight = 2 * Math.tan(vFov / 2) * distance;
    const planeWidth = planeHeight * camera.aspect;

    backgroundPlane.geometry.dispose();
    backgroundPlane.geometry = new THREE.PlaneGeometry(planeWidth * 1.2, planeHeight * 1.2);
}

/**
 * Get the video element
 * @returns {HTMLVideoElement}
 */
export function getVideoElement() {
    return videoElement;
}

/**
 * Check if camera is initialized
 * @returns {boolean}
 */
export function isCameraReady() {
    return isInitialized && videoElement && videoElement.readyState >= 2;
}

/**
 * Stop camera capture
 */
export function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    isInitialized = false;
}
