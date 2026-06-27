import * as THREE from 'three/webgpu';

const CONFIG = {

    FIRE_W: 350,
    FIRE_H: 350,

    MESH_DISTANCE: -1,

    // coloring
    FIRE_COLOR: [32, 32, 32],
    MAX_OPACITY: 0.5,
    ALPHA_THRESHOLD: 0.2,

    // heat propagation
    DECAY_BASE: 0.99,
    DECAY_VAR: 0.002,
    WEIGHT_CENTER: 2.2,
    WEIGHT_SIDES: 1.0,

    // seeding
    SEED_BASE_CHANCE: 0.3,
    SEED_BIAS_MULT: 0.55,
    SEED_HOT_BASE: 0.6,
    SEED_HOT_VAR: 0.4,
    SEED_COLD_MAX: 0.15,
};

const WEIGHT_TOTAL = CONFIG.WEIGHT_CENTER + (CONFIG.WEIGHT_SIDES * 2);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function loadSceneC(scene, camera) {
    console.log('[fire] loadSceneC optimized initialized');
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);

    const canvas = document.createElement('canvas');
    canvas.width = CONFIG.FIRE_W;
    canvas.height = CONFIG.FIRE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const heat = new Float32Array(CONFIG.FIRE_W * CONFIG.FIRE_H);
    const imgData = ctx.createImageData(CONFIG.FIRE_W, CONFIG.FIRE_H);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.frustumCulled = false;

    function layoutMesh() {
        const screenAspect = window.innerWidth / window.innerHeight;
        const fireAspect = CONFIG.FIRE_W / CONFIG.FIRE_H;

        const vHeight = 2 * Math.abs(CONFIG.MESH_DISTANCE) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const vWidth = vHeight * screenAspect;

        let targetW, targetH;

        if (screenAspect > fireAspect) {
            targetW = vWidth;
            targetH = vWidth / fireAspect;
        } else {
            targetH = vHeight;
            targetW = vHeight * fireAspect;
        }

        mesh.scale.set(targetW, targetH, 1);

        mesh.position.set(0, 0, CONFIG.MESH_DISTANCE);
    }

    function stepFire() {
        const w = CONFIG.FIRE_W;
        const h = CONFIG.FIRE_H;

        for (let x = 0; x < w; x++) {
            const chance = CONFIG.SEED_BASE_CHANCE + (x / w) * CONFIG.SEED_BIAS_MULT;
            const idx = (h - 1) * w + x;
            heat[idx] = Math.random() < chance
                ? (Math.random() * CONFIG.SEED_HOT_VAR + CONFIG.SEED_HOT_BASE)
                : (Math.random() * CONFIG.SEED_COLD_MAX);
        }

        for (let y = 0; y < h - 1; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y + 1) * w;
                const below = heat[idx + x] * CONFIG.WEIGHT_CENTER;
                const belowL = heat[idx + Math.max(0, x - 1)] * CONFIG.WEIGHT_SIDES;
                const belowR = heat[idx + Math.min(w - 1, x + 1)] * CONFIG.WEIGHT_SIDES;

                const decay = CONFIG.DECAY_BASE - Math.random() * CONFIG.DECAY_VAR;
                heat[y * w + x] = Math.max(0, ((below + belowL + belowR) / WEIGHT_TOTAL) * decay);
            }
        }
    }

    function renderFire() {
        const data = imgData.data;
        const w = CONFIG.FIRE_W;

        for (let y = 0; y < CONFIG.FIRE_H; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const ditherOffset = (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * 0.35;

                let t = Math.max(0, Math.min(1, heat[i] + ditherOffset));
                t = Math.floor(t * 4) / 4;

                const di = i * 4;
                if (t < CONFIG.ALPHA_THRESHOLD) {
                    data[di + 3] = 0;
                } else {
                    data[di] = t * CONFIG.FIRE_COLOR[0];
                    data[di + 1] = t * CONFIG.FIRE_COLOR[1];
                    data[di + 2] = t * CONFIG.FIRE_COLOR[2];
                    data[di + 3] = t * 255 * CONFIG.MAX_OPACITY;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    const preWarmFrames = CONFIG.FIRE_H * 1.5;
    for (let i = 0; i < preWarmFrames; i++) {
        stepFire();
    }

    renderFire();
    texture.needsUpdate = true;

    layoutMesh();
    scene.add(mesh);

    window.addEventListener('resize', layoutMesh);

    return function animate() {
        stepFire();
        renderFire();
        texture.needsUpdate = true;
    };
}