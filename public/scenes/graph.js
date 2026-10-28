import * as THREE from 'three/webgpu';

const CONFIG = {

    SPEED_START: 40,
    SPEED_CRUISE: 1,
    SPEED_DECAY: 0.15,

    CAMERA_YAW: 0.3,
    CAMERA_PITCH: -0.25,

    // graph volume, relative to the camera's path
    FAR: 50,
    X_MIN: -14,
    X_MAX: 6,
    Y_MIN: -15,
    Y_MAX: 5,
    CLEAR_RADIUS: 1.5,
    STEP_Z: 0.1,

    GROW_END: 28,

    NODE_RADIUS: 0.04,
    MAX_EDGES: 3,
    EDGE_MAX_LEN: 3.5,
    EDGE_LOOKBACK: 60,

    // coloring: mix of bg -> text color, scaled by OPACITY
    OPACITY: 0.5,
    NODE_MIX: 0.55,
    EDGE_MIX: 0.3,
    FOG_NEAR: 4,
    // theme fade speed & easing come from --theme-fade / --theme-ease in css
};

// oldest node must already be behind the camera (past any edge reach)
// when its slot gets reused
const NODE_COUNT = Math.ceil((CONFIG.FAR + CONFIG.EDGE_MAX_LEN + 1.5) / CONFIG.STEP_Z);

// colors are mixed as sRGB [r, g, b] like css does
function cssToSRGB(css) {
    const rgb = { r: 0, g: 0, b: 0 };
    new THREE.Color(css).getRGB(rgb, THREE.SRGBColorSpace);
    return [rgb.r, rgb.g, rgb.b];
}

function mixSRGB(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function readThemeColors() {
    const style = getComputedStyle(document.documentElement);
    return {
        bg: cssToSRGB(style.getPropertyValue('--bg-color').trim()),
        fg: cssToSRGB(style.getPropertyValue('--text-color').trim()),
    };
}

// css cubic-bezier(x1, y1, x2, y2) as a function of t in [0, 1]
function cubicBezier(x1, y1, x2, y2) {
    const at = (a, b, u) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
    return (t) => {
        // find u where x(u) = t by bisection, then return y(u)
        let lo = 0, hi = 1, u = t;
        for (let i = 0; i < 20; i++) {
            if (at(x1, x2, u) < t) lo = u; else hi = u;
            u = (lo + hi) / 2;
        }
        return at(y1, y2, u);
    };
}

function readThemeFade() {
    const style = getComputedStyle(document.documentElement);
    const fade = style.getPropertyValue('--theme-fade').trim();
    const ms = fade.endsWith('ms') ? parseFloat(fade) : parseFloat(fade) * 1000;
    const points = style.getPropertyValue('--theme-ease').match(/-?[\d.]+/g)?.map(Number);
    const ease = points?.length === 4 ? cubicBezier(...points) : (t) => t;
    return { ms: ms || 300, ease };
}

function smoothstep(edge0, edge1, x) {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
}

export function loadGraphScene(scene, camera) {
    camera.position.set(0, 0, 0);
    camera.rotation.set(CONFIG.CAMERA_PITCH, CONFIG.CAMERA_YAW, 0, 'YXZ');

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // theme colors, faded on change
    const bg = new THREE.Color();
    let current;
    let fromTheme = readThemeColors();
    let toTheme = fromTheme;
    let themeFade = null; // { start, ms, ease } while fading

    scene.background = bg;
    scene.fog = new THREE.Fog(bg, CONFIG.FOG_NEAR, CONFIG.FAR);

    const nodeMaterial = new THREE.MeshBasicMaterial();
    const edgeMaterial = new THREE.LineBasicMaterial();

    function applyTheme(t) {
        current = {
            bg: mixSRGB(fromTheme.bg, toTheme.bg, t),
            fg: mixSRGB(fromTheme.fg, toTheme.fg, t),
        };
        const node = mixSRGB(current.bg, current.fg, CONFIG.NODE_MIX * CONFIG.OPACITY);
        const edge = mixSRGB(current.bg, current.fg, CONFIG.EDGE_MIX * CONFIG.OPACITY);
        bg.setRGB(...current.bg, THREE.SRGBColorSpace);
        scene.fog.color.copy(bg);
        nodeMaterial.color.setRGB(...node, THREE.SRGBColorSpace);
        edgeMaterial.color.setRGB(...edge, THREE.SRGBColorSpace);
    }
    applyTheme(1);

    const themeObserver = new MutationObserver(() => {
        fromTheme = current;
        toTheme = readThemeColors();
        themeFade = { start: performance.now(), ...readThemeFade() };
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const positions = new Float32Array(NODE_COUNT * 3);
    const generation = new Uint32Array(NODE_COUNT);
    const parents = new Int32Array(NODE_COUNT * CONFIG.MAX_EDGES).fill(-1);
    const parentGen = new Uint32Array(NODE_COUNT * CONFIG.MAX_EDGES);

    const nodes = new THREE.InstancedMesh(
        new THREE.SphereGeometry(CONFIG.NODE_RADIUS, 8, 6),
        nodeMaterial,
        NODE_COUNT,
    );
    nodes.frustumCulled = false;
    scene.add(nodes);

    const edgePositions = new Float32Array(NODE_COUNT * CONFIG.MAX_EDGES * 2 * 3);
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.frustumCulled = false;
    scene.add(edges);

    const matrix = new THREE.Matrix4();
    let nextSlot = 0;
    let spawned = 0;
    let frontierZ = 0;

    function spawnNode(z) {
        const slot = nextSlot;
        nextSlot = (nextSlot + 1) % NODE_COUNT;

        let x, y;
        do {
            x = CONFIG.X_MIN + Math.random() * (CONFIG.X_MAX - CONFIG.X_MIN);
            y = CONFIG.Y_MIN + Math.random() * (CONFIG.Y_MAX - CONFIG.Y_MIN);
        } while (x * x + y * y < CONFIG.CLEAR_RADIUS * CONFIG.CLEAR_RADIUS);

        positions[slot * 3] = x;
        positions[slot * 3 + 1] = y;
        positions[slot * 3 + 2] = z;
        generation[slot]++;

        const candidates = [];
        const lookback = Math.min(CONFIG.EDGE_LOOKBACK, spawned);
        for (let i = 1; i <= lookback; i++) {
            const other = (slot - i + NODE_COUNT) % NODE_COUNT;
            const dx = positions[other * 3] - x;
            const dy = positions[other * 3 + 1] - y;
            const dz = positions[other * 3 + 2] - z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist <= CONFIG.EDGE_MAX_LEN) candidates.push([dist, other]);
        }
        candidates.sort((a, b) => a[0] - b[0]);

        for (let e = 0; e < CONFIG.MAX_EDGES; e++) {
            const k = slot * CONFIG.MAX_EDGES + e;
            const pick = candidates[e];
            parents[k] = pick ? pick[1] : -1;
            parentGen[k] = pick ? generation[pick[1]] : 0;
        }

        spawned++;
    }

    function fillAhead() {
        while (frontierZ > camera.position.z - CONFIG.FAR) {
            frontierZ -= CONFIG.STEP_Z;
            spawnNode(frontierZ);
        }
    }

    function arrival(slot) {
        const ahead = camera.position.z - positions[slot * 3 + 2];
        return Math.min(Math.max((CONFIG.FAR - ahead) / (CONFIG.FAR - CONFIG.GROW_END), 0), 1);
    }

    function updateGraph() {
        let v = 0;
        for (let slot = 0; slot < NODE_COUNT; slot++) {
            const t = arrival(slot);
            const grow = smoothstep(0, 0.8, t);
            const scale = smoothstep(0.6, 1, t);

            matrix.makeScale(scale, scale, scale);
            matrix.setPosition(positions[slot * 3], positions[slot * 3 + 1], positions[slot * 3 + 2]);
            nodes.setMatrixAt(slot, matrix);

            for (let e = 0; e < CONFIG.MAX_EDGES; e++) {
                const k = slot * CONFIG.MAX_EDGES + e;
                const p = parents[k];
                const from = p >= 0 && generation[p] === parentGen[k] ? p : slot;
                for (let i = 0; i < 3; i++) {
                    const start = positions[from * 3 + i];
                    edgePositions[v + i] = start;
                    edgePositions[v + 3 + i] = start + (positions[slot * 3 + i] - start) * grow;
                }
                v += 6;
            }
        }
        edgeGeometry.attributes.position.needsUpdate = true;
        nodes.instanceMatrix.needsUpdate = true;
    }

    for (let i = 0; i < NODE_COUNT; i++) {
        positions[i * 3 + 2] = 10;
    }
    fillAhead();
    updateGraph();

    let startTime = null;
    let lastTime = null;

    function animate(time) {
        if (startTime === null) startTime = lastTime = time;
        const dt = Math.min((time - lastTime) / 1000, 0.05);
        lastTime = time;

        if (themeFade) {
            const t = Math.min((performance.now() - themeFade.start) / themeFade.ms, 1);
            applyTheme(themeFade.ease(t));
            if (t === 1) themeFade = null;
        }

        if (reduceMotion) return;

        const elapsed = (time - startTime) / 1000;
        const speed = CONFIG.SPEED_CRUISE
            + (CONFIG.SPEED_START - CONFIG.SPEED_CRUISE) * Math.exp(-elapsed / CONFIG.SPEED_DECAY);
        camera.position.z -= speed * dt;

        fillAhead();
        updateGraph();
    }

    animate.dispose = () => themeObserver.disconnect();
    return animate;
}
