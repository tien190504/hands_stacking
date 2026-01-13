/**
 * JARVIS AR - Earth Module
 * 3D Earth with particle system, gesture controls, and dual Earth mode
 */

import * as THREE from 'three';

// Earth state
let earthGroup = null;
let earthMesh = null;
let particleSystem = null;
let earthTexture = null;

// Dual Earth state
let leftEarth = null;
let rightEarth = null;
let isDualMode = false;
let isMerging = false;

// Controls state
let earthRotation = { x: 0, y: 0 };
let earthScale = 1;
let targetScale = 1;
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };

// Particle settings
const PARTICLE_COUNT = 3500;
const EARTH_RADIUS = 0.5;
const PARTICLE_BASE_RADIUS = 0.7;

/**
 * Create Earth instance entirely made of particles
 * @param {THREE.TextureLoader} textureLoader - Texture loader
 * @returns {THREE.Group} Earth group with particle mesh
 */
export function createEarthInstance(textureLoader) {
    const group = new THREE.Group();

    // Load Earth texture for color sampling
    const texture = textureLoader.load('assets/earth_texture.png');
    texture.colorSpace = THREE.SRGBColorSpace;

    // Create Earth made entirely of particles
    const earthParticles = createEarthParticleSystem();
    earthParticles.name = 'earthParticles';
    group.add(earthParticles);

    // Atmosphere glow (keeping this for visual effect)
    const atmosGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.1, 32, 32);
    const atmosMat = new THREE.ShaderMaterial({
        uniforms: {
            glowColor: { value: new THREE.Color(0x00D4FF) },
            viewVector: { value: new THREE.Vector3(0, 0, 1) }
        },
        vertexShader: `
            uniform vec3 viewVector;
            varying float intensity;
            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                vec3 actual_normal = normalize(normalMatrix * normal);
                intensity = pow(0.6 - dot(actual_normal, vec3(0, 0, 1)), 2.0);
            }
        `,
        fragmentShader: `
            uniform vec3 glowColor;
            varying float intensity;
            void main() {
                vec3 glow = glowColor * intensity;
                gl_FragColor = vec4(glow, intensity * 0.3);
            }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true
    });

    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    atmosphere.name = 'atmosphere';
    group.add(atmosphere);

    // Outer particle cloud (orbiting particles)
    const outerParticles = createOuterParticleSystem();
    outerParticles.name = 'particles';
    group.add(outerParticles);

    // Store references
    group.userData = {
        earth: null, // No solid sphere
        atmosphere,
        earthParticles,
        particles: outerParticles,
        particlePositions: outerParticles.geometry.attributes.position.array.slice(),
        earthParticlePositions: earthParticles.geometry.attributes.position.array.slice(),
        particleVelocities: new Float32Array(800 * 3),
        earthParticleVelocities: new Float32Array(PARTICLE_COUNT * 3),
        dispersed: false,
        dispersionAmount: 0
    };

    return group;
}

/**
 * Create Earth made entirely of particles forming the globe shape
 * @returns {THREE.Points} Earth particle system
 */
function createEarthParticleSystem() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);

    // Color palette for Earth-like appearance
    const oceanColor = new THREE.Color(0x00D4FF);     // Electric blue for ocean
    const landColor = new THREE.Color(0x00FF88);      // Bright green for land
    const polarColor = new THREE.Color(0xFFFFFF);     // White for poles
    const deepOceanColor = new THREE.Color(0x0066AA); // Deep ocean

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Uniform spherical distribution using Fibonacci sphere
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        const theta = 2 * Math.PI * i / goldenRatio;
        const phi = Math.acos(1 - 2 * (i + 0.5) / PARTICLE_COUNT);

        // Add slight randomness for organic look
        const radiusVariation = EARTH_RADIUS * (0.98 + Math.random() * 0.04);

        const x = radiusVariation * Math.sin(phi) * Math.cos(theta);
        const y = radiusVariation * Math.sin(phi) * Math.sin(theta);
        const z = radiusVariation * Math.cos(phi);

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        // Color based on position (simulate continents/ocean)
        const latitude = Math.abs(z / EARTH_RADIUS); // 0 = equator, 1 = pole
        const longitude = Math.atan2(y, x);

        let color;

        // Polar regions
        if (latitude > 0.85) {
            color = polarColor.clone();
            color.lerp(oceanColor, Math.random() * 0.3);
        }
        // Create "continent" patterns using noise-like function
        else {
            const noise = Math.sin(longitude * 3) * Math.cos(phi * 4) +
                Math.sin(longitude * 7 + 1) * Math.cos(phi * 5 + 2) * 0.5;

            if (noise > 0.3) {
                // Land
                color = landColor.clone();
                color.lerp(oceanColor, 0.2 + Math.random() * 0.2);
            } else if (noise > -0.2) {
                // Shallow ocean / coastal
                color = oceanColor.clone();
                color.lerp(landColor, Math.random() * 0.15);
            } else {
                // Deep ocean
                color = deepOceanColor.clone();
                color.lerp(oceanColor, 0.3 + Math.random() * 0.3);
            }
        }

        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        // Vary particle sizes
        sizes[i] = 3 + Math.random() * 4;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
        size: 0.018,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });

    return new THREE.Points(geometry, material);
}

/**
 * Create outer particle cloud orbiting Earth
 * @returns {THREE.Points} Outer particle system
 */
function createOuterParticleSystem() {
    const outerCount = 800;
    const positions = new Float32Array(outerCount * 3);
    const colors = new Float32Array(outerCount * 3);
    const sizes = new Float32Array(outerCount);

    const baseColor = new THREE.Color(0x00D4FF);

    for (let i = 0; i < outerCount; i++) {
        // Spherical distribution in outer shell
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const radius = PARTICLE_BASE_RADIUS + Math.random() * 0.4;

        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);

        // Color variation
        const colorVariation = 0.5 + Math.random() * 0.5;
        colors[i * 3] = baseColor.r * colorVariation;
        colors[i * 3 + 1] = baseColor.g * colorVariation;
        colors[i * 3 + 2] = baseColor.b * colorVariation;

        sizes[i] = 1.5 + Math.random() * 2.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
        size: 0.012,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });

    return new THREE.Points(geometry, material);
}

/**
 * Create particle system orbiting Earth
 * @returns {THREE.Points} Particle system
 */
function createParticleSystem() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);

    const baseColor = new THREE.Color(0x00D4FF);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Spherical distribution around Earth
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const radius = PARTICLE_BASE_RADIUS + Math.random() * 0.3;

        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);

        // Color variation
        const colorVariation = 0.7 + Math.random() * 0.3;
        colors[i * 3] = baseColor.r * colorVariation;
        colors[i * 3 + 1] = baseColor.g * colorVariation;
        colors[i * 3 + 2] = baseColor.b * colorVariation;

        sizes[i] = 2 + Math.random() * 3;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
        size: 0.015,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });

    return new THREE.Points(geometry, material);
}

/**
 * Initialize main Earth
 * @param {THREE.Scene} scene - Three.js scene
 * @param {THREE.TextureLoader} textureLoader - Texture loader
 */
export function initEarth(scene, textureLoader) {
    earthGroup = createEarthInstance(textureLoader);
    earthGroup.position.set(0, 0, -3);
    earthGroup.name = 'mainEarth';
    scene.add(earthGroup);

    earthMesh = earthGroup.userData.earth;
    particleSystem = earthGroup.userData.particles;

    // Setup mouse controls
    setupMouseControls();

    return earthGroup;
}

/**
 * Setup mouse drag controls for Earth
 */
function setupMouseControls() {
    const canvas = document.getElementById('three-canvas');

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMousePos = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - lastMousePos.x;
        const deltaY = e.clientY - lastMousePos.y;

        earthRotation.y += deltaX * 0.005;
        earthRotation.x += deltaY * 0.005;

        lastMousePos = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    // Mouse wheel zoom
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        targetScale += e.deltaY * -0.001;
        targetScale = Math.max(0.3, Math.min(2, targetScale));
    });
}

/**
 * Handle pinch gesture for zoom
 * @param {number} pinchDistance - Current pinch distance
 * @param {number} prevPinchDistance - Previous pinch distance
 */
export function handlePinchZoom(pinchDistance, prevPinchDistance) {
    if (prevPinchDistance > 0) {
        const delta = pinchDistance - prevPinchDistance;
        targetScale += delta * 5;
        targetScale = Math.max(0.3, Math.min(2, targetScale));
    }
}

/**
 * Handle wave gesture for rotation
 * @param {number} velocity - Wave velocity
 * @param {number} direction - Wave direction (-1 left, 1 right)
 */
export function handleWaveRotation(velocity, direction) {
    earthRotation.y += velocity * direction * 0.5;
}

/**
 * Spawn dual Earths
 * @param {THREE.Scene} scene
 * @param {THREE.TextureLoader} textureLoader
 */
export function spawnDualEarths(scene, textureLoader) {
    if (isDualMode) return;

    isDualMode = true;

    // Hide main Earth
    if (earthGroup) {
        earthGroup.visible = false;
    }

    // Create left Earth
    leftEarth = createEarthInstance(textureLoader);
    leftEarth.position.set(-1.2, 0, -3);
    leftEarth.scale.setScalar(0.7);
    leftEarth.name = 'leftEarth';
    scene.add(leftEarth);

    // Create right Earth
    rightEarth = createEarthInstance(textureLoader);
    rightEarth.position.set(1.2, 0, -3);
    rightEarth.scale.setScalar(0.7);
    rightEarth.name = 'rightEarth';
    scene.add(rightEarth);

    console.log('[JARVIS] Dual Earth mode activated');
}

/**
 * Merge dual Earths back to single
 * @param {THREE.Scene} scene
 */
export function mergeEarths(scene) {
    if (!isDualMode || isMerging) return;

    isMerging = true;

    // Animate merge
    const duration = 1000;
    const startTime = Date.now();

    const mergeAnimation = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic

        if (leftEarth && rightEarth) {
            leftEarth.position.x = -1.2 * (1 - eased);
            rightEarth.position.x = 1.2 * (1 - eased);

            const scale = 0.7 + 0.3 * eased;
            leftEarth.scale.setScalar(scale * (1 - progress * 0.5));
            rightEarth.scale.setScalar(scale * (1 - progress * 0.5));
        }

        if (progress < 1) {
            requestAnimationFrame(mergeAnimation);
        } else {
            // Complete merge
            if (leftEarth) scene.remove(leftEarth);
            if (rightEarth) scene.remove(rightEarth);
            leftEarth = null;
            rightEarth = null;

            if (earthGroup) {
                earthGroup.visible = true;
                earthGroup.scale.setScalar(1);
            }

            isDualMode = false;
            isMerging = false;
            console.log('[JARVIS] Earth merge complete');
        }
    };

    requestAnimationFrame(mergeAnimation);
}

/**
 * Disperse particles on an Earth instance (both Earth and outer particles)
 * @param {THREE.Group} earth - Earth group
 * @param {number} intensity - Dispersion intensity (0-1)
 */
export function disperseParticles(earth, intensity) {
    if (!earth) return;

    earth.userData.dispersed = true;
    earth.userData.dispersionAmount = Math.min(1, (earth.userData.dispersionAmount || 0) + intensity * 0.1);

    // Disperse Earth particles (the globe itself)
    if (earth.userData.earthParticles) {
        const particles = earth.userData.earthParticles;
        const positions = particles.geometry.attributes.position.array;
        const velocities = earth.userData.earthParticleVelocities || new Float32Array(PARTICLE_COUNT * 3);

        for (let i = 0; i < PARTICLE_COUNT * 3; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            const len = Math.sqrt(x * x + y * y + z * z);

            if (len > 0) {
                velocities[i] += (x / len) * intensity * 0.025;
                velocities[i + 1] += (y / len) * intensity * 0.025;
                velocities[i + 2] += (z / len) * intensity * 0.025;
            }
        }

        earth.userData.earthParticleVelocities = velocities;
    }

    // Disperse outer particles
    if (earth.userData.particles) {
        const particles = earth.userData.particles;
        const positions = particles.geometry.attributes.position.array;
        const velocities = earth.userData.particleVelocities || new Float32Array(800 * 3);

        for (let i = 0; i < 800 * 3; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            const len = Math.sqrt(x * x + y * y + z * z);

            if (len > 0) {
                velocities[i] += (x / len) * intensity * 0.03;
                velocities[i + 1] += (y / len) * intensity * 0.03;
                velocities[i + 2] += (z / len) * intensity * 0.03;
            }
        }

        earth.userData.particleVelocities = velocities;
    }
}

/**
 * Converge particles back to Earth (both Earth and outer particles)
 * @param {THREE.Group} earth - Earth group
 * @param {number} intensity - Convergence intensity (0-1)
 */
export function convergeParticles(earth, intensity) {
    if (!earth) return;

    earth.userData.dispersionAmount = Math.max(0, (earth.userData.dispersionAmount || 0) - intensity * 0.15);

    // Converge Earth particles
    if (earth.userData.earthParticles && earth.userData.earthParticlePositions) {
        const particles = earth.userData.earthParticles;
        const positions = particles.geometry.attributes.position.array;
        const basePositions = earth.userData.earthParticlePositions;

        for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
            positions[i] += (basePositions[i] - positions[i]) * intensity * 0.12;
        }

        particles.geometry.attributes.position.needsUpdate = true;

        // Also reduce velocities
        if (earth.userData.earthParticleVelocities) {
            for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
                earth.userData.earthParticleVelocities[i] *= 0.9;
            }
        }
    }

    // Converge outer particles 
    if (earth.userData.particles && earth.userData.particlePositions) {
        const particles = earth.userData.particles;
        const positions = particles.geometry.attributes.position.array;
        const basePositions = earth.userData.particlePositions;

        for (let i = 0; i < 800 * 3; i++) {
            positions[i] += (basePositions[i] - positions[i]) * intensity * 0.1;
        }

        particles.geometry.attributes.position.needsUpdate = true;
    }

    if (earth.userData.dispersionAmount <= 0) {
        earth.userData.dispersed = false;
    }
}

/**
 * Update Earth animation
 * @param {number} deltaTime - Time since last frame
 */
export function updateEarth(deltaTime) {
    // Smooth scale interpolation
    earthScale += (targetScale - earthScale) * 0.1;

    // Update single Earth
    if (earthGroup && earthGroup.visible) {
        earthGroup.rotation.x = earthRotation.x;
        earthGroup.rotation.y += deltaTime * 0.1; // Auto rotation
        earthGroup.rotation.y += earthRotation.y * 0.02;
        earthRotation.y *= 0.95; // Decay rotation momentum

        earthGroup.scale.setScalar(earthScale);

        // Animate particles
        updateParticles(earthGroup, deltaTime);
    }

    // Update dual Earths
    if (isDualMode && !isMerging) {
        if (leftEarth) {
            leftEarth.rotation.y += deltaTime * 0.15;
            updateParticles(leftEarth, deltaTime);
        }
        if (rightEarth) {
            rightEarth.rotation.y -= deltaTime * 0.15;
            updateParticles(rightEarth, deltaTime);
        }
    }
}

/**
 * Update particle animation for an Earth instance
 * @param {THREE.Group} earth - Earth group
 * @param {number} deltaTime - Time since last frame
 */
function updateParticles(earth, deltaTime) {
    if (!earth) return;

    // Update Earth particles (the globe itself)
    if (earth.userData.earthParticles && earth.userData.earthParticleVelocities) {
        const particles = earth.userData.earthParticles;
        const positions = particles.geometry.attributes.position.array;
        const velocities = earth.userData.earthParticleVelocities;

        let hasMotion = false;
        for (let i = 0; i < PARTICLE_COUNT * 3; i += 3) {
            positions[i] += velocities[i];
            positions[i + 1] += velocities[i + 1];
            positions[i + 2] += velocities[i + 2];

            // Damping
            velocities[i] *= 0.97;
            velocities[i + 1] *= 0.97;
            velocities[i + 2] *= 0.97;

            if (Math.abs(velocities[i]) > 0.0001) hasMotion = true;
        }

        if (hasMotion) {
            particles.geometry.attributes.position.needsUpdate = true;
        }
    }

    // Update outer particles
    if (earth.userData.particles && earth.userData.particleVelocities) {
        const particles = earth.userData.particles;
        const positions = particles.geometry.attributes.position.array;
        const velocities = earth.userData.particleVelocities;

        let hasMotion = false;
        for (let i = 0; i < 800 * 3; i += 3) {
            positions[i] += velocities[i];
            positions[i + 1] += velocities[i + 1];
            positions[i + 2] += velocities[i + 2];

            // Damping
            velocities[i] *= 0.98;
            velocities[i + 1] *= 0.98;
            velocities[i + 2] *= 0.98;

            if (Math.abs(velocities[i]) > 0.0001) hasMotion = true;
        }

        if (hasMotion) {
            particles.geometry.attributes.position.needsUpdate = true;
        }
    }

    // Gentle orbital motion for outer particles when not dispersed
    if (earth.userData.particles && !earth.userData.dispersed) {
        earth.userData.particles.rotation.y += deltaTime * 0.05;
        earth.userData.particles.rotation.x += deltaTime * 0.02;
    }
}

/**
 * Get current Earth mode
 * @returns {string} 'SINGLE', 'DUAL', or 'MERGING'
 */
export function getEarthMode() {
    if (isMerging) return 'MERGING';
    if (isDualMode) return 'DUAL';
    return 'SINGLE';
}

/**
 * Check if in dual mode
 * @returns {boolean}
 */
export function isDualEarthMode() {
    return isDualMode;
}

/**
 * Get left Earth instance
 * @returns {THREE.Group|null}
 */
export function getLeftEarth() {
    return leftEarth;
}

/**
 * Get right Earth instance  
 * @returns {THREE.Group|null}
 */
export function getRightEarth() {
    return rightEarth;
}

/**
 * Get main Earth instance
 * @returns {THREE.Group|null}
 */
export function getMainEarth() {
    return earthGroup;
}
