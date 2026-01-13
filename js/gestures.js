/**
 * JARVIS AR - Gesture Detection Module
 * Detects pinch, wave, spread, converge, and grasp gestures
 */

// Gesture thresholds
const PINCH_THRESHOLD = 0.06;         // Distance for pinch detection
const WAVE_VELOCITY_THRESHOLD = 0.02; // Minimum velocity for wave
const SPREAD_THRESHOLD = 0.3;         // Distance between hands for spread
const CONVERGE_THRESHOLD = 0.15;      // Distance for converge
const SAME_LOCATION_THRESHOLD = 0.12; // Proximity for same location
const GRASP_THRESHOLD = 0.08;         // Finger curl threshold

// History for velocity tracking
const handHistory = {
    left: [],
    right: []
};
const HISTORY_LENGTH = 5;

/**
 * Calculate distance between two 3D points
 * @param {Object} p1 - First point {x, y, z}
 * @param {Object} p2 - Second point {x, y, z}
 * @returns {number} Distance
 */
function distance3D(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate 2D distance
 * @param {Object} p1 - First point {x, y}
 * @param {Object} p2 - Second point {x, y}
 * @returns {number} Distance
 */
function distance2D(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get palm center from hand landmarks
 * @param {Array} landmarks - 21 hand landmarks
 * @returns {{x: number, y: number, z: number}}
 */
function getPalmCenter(landmarks) {
    // Average of wrist and base of fingers
    const indices = [0, 5, 9, 13, 17];
    let x = 0, y = 0, z = 0;
    indices.forEach(i => {
        x += landmarks[i].x;
        y += landmarks[i].y;
        z += landmarks[i].z || 0;
    });
    return {
        x: x / indices.length,
        y: y / indices.length,
        z: z / indices.length
    };
}

/**
 * Detect pinch gesture (thumb and index finger close together)
 * @param {Array} landmarks - 21 hand landmarks
 * @returns {{isPinching: boolean, distance: number}}
 */
export function detectPinch(landmarks) {
    if (!landmarks || landmarks.length < 21) {
        return { isPinching: false, distance: 1 };
    }

    // Thumb tip (4) and index finger tip (8)
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];

    const dist = distance3D(thumbTip, indexTip);

    return {
        isPinching: dist < PINCH_THRESHOLD,
        distance: dist
    };
}

/**
 * Detect wave gesture (horizontal hand movement)
 * @param {Array} landmarks - Current hand landmarks
 * @param {'left'|'right'} handType - Which hand
 * @returns {{isWaving: boolean, velocity: number, direction: number}}
 */
export function detectWave(landmarks, handType) {
    if (!landmarks || landmarks.length < 21) {
        return { isWaving: false, velocity: 0, direction: 0 };
    }

    const history = handHistory[handType];
    const palmCenter = getPalmCenter(landmarks);

    // Add to history
    history.push({ x: palmCenter.x, y: palmCenter.y, time: Date.now() });

    // Keep history limited
    while (history.length > HISTORY_LENGTH) {
        history.shift();
    }

    if (history.length < 2) {
        return { isWaving: false, velocity: 0, direction: 0 };
    }

    // Calculate velocity
    const oldest = history[0];
    const newest = history[history.length - 1];
    const timeDelta = (newest.time - oldest.time) / 1000; // seconds

    if (timeDelta < 0.01) {
        return { isWaving: false, velocity: 0, direction: 0 };
    }

    const xVelocity = (newest.x - oldest.x) / timeDelta;
    const absVelocity = Math.abs(xVelocity);

    return {
        isWaving: absVelocity > WAVE_VELOCITY_THRESHOLD,
        velocity: absVelocity,
        direction: Math.sign(xVelocity) // -1 = left, 1 = right
    };
}

/**
 * Check if both hands are in the same location
 * @param {Array} leftLandmarks - Left hand landmarks
 * @param {Array} rightLandmarks - Right hand landmarks
 * @returns {boolean}
 */
export function isSameLocation(leftLandmarks, rightLandmarks) {
    if (!leftLandmarks || !rightLandmarks) {
        return false;
    }

    const leftPalm = getPalmCenter(leftLandmarks);
    const rightPalm = getPalmCenter(rightLandmarks);

    return distance2D(leftPalm, rightPalm) < SAME_LOCATION_THRESHOLD;
}

/**
 * Get distance between both hands
 * @param {Array} leftLandmarks - Left hand landmarks
 * @param {Array} rightLandmarks - Right hand landmarks
 * @returns {number} Distance between palms
 */
export function getHandsDistance(leftLandmarks, rightLandmarks) {
    if (!leftLandmarks || !rightLandmarks) {
        return 0;
    }

    const leftPalm = getPalmCenter(leftLandmarks);
    const rightPalm = getPalmCenter(rightLandmarks);

    return distance2D(leftPalm, rightPalm);
}

/**
 * Detect spread gesture (both hands moving apart)
 * @param {Array} leftLandmarks - Left hand
 * @param {Array} rightLandmarks - Right hand
 * @param {number} previousDistance - Previous distance between hands
 * @returns {{isSpreading: boolean, delta: number, currentDistance: number}}
 */
export function detectSpread(leftLandmarks, rightLandmarks, previousDistance) {
    const currentDistance = getHandsDistance(leftLandmarks, rightLandmarks);

    if (!leftLandmarks || !rightLandmarks || previousDistance === null) {
        return { isSpreading: false, delta: 0, currentDistance };
    }

    const delta = currentDistance - previousDistance;

    return {
        isSpreading: delta > 0.02 && currentDistance > SPREAD_THRESHOLD,
        delta,
        currentDistance
    };
}

/**
 * Detect converge gesture (both hands moving together)
 * @param {Array} leftLandmarks - Left hand
 * @param {Array} rightLandmarks - Right hand
 * @param {number} previousDistance - Previous distance
 * @returns {{isConverging: boolean, delta: number, currentDistance: number}}
 */
export function detectConverge(leftLandmarks, rightLandmarks, previousDistance) {
    const currentDistance = getHandsDistance(leftLandmarks, rightLandmarks);

    if (!leftLandmarks || !rightLandmarks || previousDistance === null) {
        return { isConverging: false, delta: 0, currentDistance };
    }

    const delta = previousDistance - currentDistance;

    return {
        isConverging: delta > 0.02 && currentDistance < CONVERGE_THRESHOLD,
        delta,
        currentDistance
    };
}

/**
 * Check if a hand is in a grasping/fist position
 * @param {Array} landmarks - Hand landmarks
 * @returns {boolean}
 */
export function isGrasping(landmarks) {
    if (!landmarks || landmarks.length < 21) {
        return false;
    }

    // Check if all fingers are curled
    // Compare fingertips to their base joints
    const fingerChecks = [
        [8, 5],   // Index: tip vs MCP
        [12, 9],  // Middle: tip vs MCP
        [16, 13], // Ring: tip vs MCP
        [20, 17]  // Pinky: tip vs MCP
    ];

    let curledCount = 0;

    for (const [tipIdx, baseIdx] of fingerChecks) {
        const tip = landmarks[tipIdx];
        const base = landmarks[baseIdx];
        const wrist = landmarks[0];

        // Finger is curled if tip is closer to wrist than base
        const tipToWrist = distance2D(tip, wrist);
        const baseToWrist = distance2D(base, wrist);

        if (tipToWrist < baseToWrist * 1.2) {
            curledCount++;
        }
    }

    return curledCount >= 3;
}

/**
 * Check if a hand has spread/open fingers
 * @param {Array} landmarks - Hand landmarks
 * @returns {boolean}
 */
export function isOpenHand(landmarks) {
    if (!landmarks || landmarks.length < 21) {
        return false;
    }

    // Check if fingers are extended (not curled)
    const fingerChecks = [
        [8, 6],   // Index: tip vs PIP
        [12, 10], // Middle: tip vs PIP
        [16, 14], // Ring: tip vs PIP
        [20, 18]  // Pinky: tip vs PIP
    ];

    let extendedCount = 0;

    for (const [tipIdx, pipIdx] of fingerChecks) {
        const tip = landmarks[tipIdx];
        const pip = landmarks[pipIdx];
        const wrist = landmarks[0];

        // Finger is extended if tip is further from wrist than PIP
        const tipToWrist = distance2D(tip, wrist);
        const pipToWrist = distance2D(pip, wrist);

        if (tipToWrist > pipToWrist * 1.1) {
            extendedCount++;
        }
    }

    return extendedCount >= 3;
}

/**
 * Detect grasp gesture (both hands grasping in same location)
 * @param {Array} leftLandmarks - Left hand
 * @param {Array} rightLandmarks - Right hand
 * @returns {boolean}
 */
export function detectGrasp(leftLandmarks, rightLandmarks) {
    if (!leftLandmarks || !rightLandmarks) {
        return false;
    }

    const bothGrasping = isGrasping(leftLandmarks) && isGrasping(rightLandmarks);
    const samePlace = isSameLocation(leftLandmarks, rightLandmarks);

    return bothGrasping && samePlace;
}

/**
 * Get comprehensive gesture state
 * @param {Array} leftLandmarks - Left hand
 * @param {Array} rightLandmarks - Right hand
 * @param {Object} previousState - Previous gesture state
 * @returns {Object} Complete gesture state
 */
export function getGestureState(leftLandmarks, rightLandmarks, previousState = {}) {
    const leftPinch = leftLandmarks ? detectPinch(leftLandmarks) : { isPinching: false, distance: 1 };
    const rightPinch = rightLandmarks ? detectPinch(rightLandmarks) : { isPinching: false, distance: 1 };

    const leftWave = detectWave(leftLandmarks, 'left');
    const rightWave = detectWave(rightLandmarks, 'right');

    const spread = detectSpread(leftLandmarks, rightLandmarks, previousState.handsDistance || null);
    const converge = detectConverge(leftLandmarks, rightLandmarks, previousState.handsDistance || null);

    const grasp = detectGrasp(leftLandmarks, rightLandmarks);
    const sameLocation = isSameLocation(leftLandmarks, rightLandmarks);

    const handsDistance = getHandsDistance(leftLandmarks, rightLandmarks);

    return {
        left: {
            detected: !!leftLandmarks,
            pinch: leftPinch,
            wave: leftWave,
            grasping: isGrasping(leftLandmarks),
            open: isOpenHand(leftLandmarks)
        },
        right: {
            detected: !!rightLandmarks,
            pinch: rightPinch,
            wave: rightWave,
            grasping: isGrasping(rightLandmarks),
            open: isOpenHand(rightLandmarks)
        },
        bothHands: {
            detected: !!leftLandmarks && !!rightLandmarks,
            sameLocation,
            spreading: spread.isSpreading,
            converging: converge.isConverging,
            grasping: grasp
        },
        handsDistance,
        spreadDelta: spread.delta,
        convergeDelta: converge.delta
    };
}

/**
 * Get gesture name for UI display
 * @param {Object} gestureState - Gesture state from getGestureState
 * @returns {string} Human-readable gesture name
 */
export function getGestureName(gestureState) {
    // Both hands clasped together (grasping at same location)
    if (gestureState.bothHands.grasping) {
        return 'CLASPED - MERGE';
    }

    // Single hand gestures
    if (gestureState.left.grasping || gestureState.right.grasping) {
        return 'FIST - CONVERGE';
    }
    if (gestureState.left.open || gestureState.right.open) {
        return 'OPEN - DISPERSE';
    }

    if (gestureState.bothHands.detected) return 'DUAL EARTH MODE';

    if (gestureState.left.pinch.isPinching || gestureState.right.pinch.isPinching) {
        return 'PINCH - ZOOM';
    }
    if (gestureState.left.wave.isWaving || gestureState.right.wave.isWaving) {
        return 'WAVE - ROTATE';
    }

    if (gestureState.left.detected || gestureState.right.detected) return 'HAND DETECTED';

    return 'AWAITING INPUT';
}
