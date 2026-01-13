/**
 * JARVIS AR - MediaPipe Module
 * Handles Face Mesh and Hand tracking integration
 */

let faceMesh = null;
let hands = null;
let latestFaceResults = null;
let latestHandResults = null;
let isReady = false;

// Callbacks for results
let onFaceResults = null;
let onHandResults = null;

/**
 * Initialize MediaPipe Face Mesh
 * @param {HTMLVideoElement} videoElement - Video source
 * @returns {Promise<void>}
 */
export async function initFaceMesh(videoElement) {
    return new Promise((resolve, reject) => {
        try {
            faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
                }
            });

            faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            faceMesh.onResults((results) => {
                latestFaceResults = results;
                if (onFaceResults) onFaceResults(results);
            });

            faceMesh.initialize().then(() => {
                console.log('[JARVIS] Face Mesh initialized');
                resolve();
            });
        } catch (error) {
            console.error('[JARVIS] Face Mesh initialization failed:', error);
            reject(error);
        }
    });
}

/**
 * Initialize MediaPipe Hands
 * @param {HTMLVideoElement} videoElement - Video source  
 * @returns {Promise<void>}
 */
export async function initHands(videoElement) {
    return new Promise((resolve, reject) => {
        try {
            hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`;
                }
            });

            hands.setOptions({
                maxNumHands: 2,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            hands.onResults((results) => {
                latestHandResults = results;
                if (onHandResults) onHandResults(results);
            });

            hands.initialize().then(() => {
                console.log('[JARVIS] Hands initialized');
                resolve();
            });
        } catch (error) {
            console.error('[JARVIS] Hands initialization failed:', error);
            reject(error);
        }
    });
}

/**
 * Initialize all MediaPipe components
 * @param {HTMLVideoElement} videoElement - Video source
 * @returns {Promise<void>}
 */
export async function initMediaPipe(videoElement) {
    // Initialize sequentially to avoid cross-loading conflicts
    await initFaceMesh(videoElement);
    await initHands(videoElement);
    isReady = true;
    console.log('[JARVIS] MediaPipe fully initialized');
}

/**
 * Process a video frame through both trackers
 * @param {HTMLVideoElement} videoElement - Video source
 */
export async function processFrame(videoElement) {
    if (!isReady) return;

    try {
        await Promise.all([
            faceMesh.send({ image: videoElement }),
            hands.send({ image: videoElement })
        ]);
    } catch (error) {
        console.warn('[JARVIS] Frame processing error:', error);
    }
}

/**
 * Get latest face landmarks
 * @returns {Object|null} Face mesh results
 */
export function getFaceResults() {
    return latestFaceResults;
}

/**
 * Get latest hand landmarks
 * @returns {Object|null} Hand tracking results
 */
export function getHandResults() {
    return latestHandResults;
}

/**
 * Get face position in normalized coordinates
 * Returns the nose tip position as the main tracking point
 * @returns {{x: number, y: number, z: number}|null}
 */
export function getFacePosition() {
    if (!latestFaceResults || !latestFaceResults.multiFaceLandmarks ||
        latestFaceResults.multiFaceLandmarks.length === 0) {
        return null;
    }

    // Nose tip is landmark index 1
    const noseTip = latestFaceResults.multiFaceLandmarks[0][1];
    return {
        x: noseTip.x,  // 0-1, left to right
        y: noseTip.y,  // 0-1, top to bottom
        z: noseTip.z   // Depth estimate
    };
}

/**
 * Get forehead position for HUD placement
 * @returns {{x: number, y: number}|null}
 */
export function getForeheadPosition() {
    if (!latestFaceResults || !latestFaceResults.multiFaceLandmarks ||
        latestFaceResults.multiFaceLandmarks.length === 0) {
        return null;
    }

    // Forehead center is around landmark index 10
    const forehead = latestFaceResults.multiFaceLandmarks[0][10];
    return {
        x: forehead.x,
        y: forehead.y
    };
}

/**
 * Get hand landmarks with handedness
 * @returns {Array<{landmarks: Array, handedness: string}>}
 */
export function getHands() {
    if (!latestHandResults || !latestHandResults.multiHandLandmarks) {
        return [];
    }

    return latestHandResults.multiHandLandmarks.map((landmarks, index) => {
        const handedness = latestHandResults.multiHandedness[index]?.label || 'Unknown';
        return {
            landmarks,
            handedness: handedness === 'Left' ? 'Right' : 'Left' // Mirror for selfie view
        };
    });
}

/**
 * Get specific hand by type
 * @param {'Left'|'Right'} handType - Which hand to get
 * @returns {Array|null} Hand landmarks or null
 */
export function getHand(handType) {
    const allHands = getHands();
    const hand = allHands.find(h => h.handedness === handType);
    return hand ? hand.landmarks : null;
}

/**
 * Convert normalized coordinates to screen space
 * @param {number} normalizedX - 0-1 range
 * @param {number} normalizedY - 0-1 range
 * @param {number} width - Screen width
 * @param {number} height - Screen height
 * @returns {{x: number, y: number}}
 */
export function toScreenSpace(normalizedX, normalizedY, width, height) {
    return {
        x: (1 - normalizedX) * width, // Mirror for selfie
        y: normalizedY * height
    };
}

/**
 * Convert normalized coordinates to Three.js world space
 * @param {number} normalizedX - 0-1 range
 * @param {number} normalizedY - 0-1 range
 * @param {number} depth - Z depth
 * @param {THREE.Camera} camera - Three.js camera
 * @returns {THREE.Vector3}
 */
export function toWorldSpace(normalizedX, normalizedY, depth, camera) {
    // Convert to NDC (-1 to 1)
    const ndcX = (1 - normalizedX) * 2 - 1; // Mirror 
    const ndcY = -(normalizedY * 2 - 1);

    // Create a vector in clip space
    const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
    vector.unproject(camera);

    // Get direction from camera
    const dir = vector.sub(camera.position).normalize();
    const distance = depth / dir.z;

    return camera.position.clone().add(dir.multiplyScalar(distance));
}

/**
 * Set callback for face results
 * @param {Function} callback
 */
export function setFaceResultsCallback(callback) {
    onFaceResults = callback;
}

/**
 * Set callback for hand results
 * @param {Function} callback
 */
export function setHandResultsCallback(callback) {
    onHandResults = callback;
}

/**
 * Check if MediaPipe is ready
 * @returns {boolean}
 */
export function isMediaPipeReady() {
    return isReady;
}
