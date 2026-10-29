// three.js and the scenes are imported only once the page itself has loaded
// (see startWhenIdle), so they never compete with fonts, images or the page
let THREE;

// sc 1: box
function loadSceneA(scene, camera) {
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: true });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    return function animate(time) {
        mesh.rotation.x = time * 0.001;
        mesh.rotation.y = time * 0.002;
    };
}

// sc 2: torus
function loadSceneB(scene, camera) {
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);

    const geometry = new THREE.TorusGeometry(0.7, 0.2, 8, 24);
    const material = new THREE.MeshBasicMaterial({ color: 0x00aaff, wireframe: true });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    return function animate(time) {
        mesh.rotation.y = time * 0.001;
        mesh.rotation.z = time * 0.001;
    };
}

// each entry loads a scene function. older scenes: loadSceneA, loadSceneB,
// () => import('./scenes/rooms.js').then(m => m.initPathScene),
// () => import('./scenes/fire.js').then(m => m.loadSceneC)
const scenePickers = [
    () => import('./scenes/graph.js').then(m => m.loadGraphScene),
];

const RENDER = {
    PIXEL_RATIO: 0.7,
    MAX_FPS: 45,
};

async function initEngine(canvas) {
    const engine = { canvas, stopped: false, stop: () => { engine.stopped = true; } };

    const pickScene = scenePickers[Math.floor(Math.random() * scenePickers.length)];
    const [three, chosenPicker] = await Promise.all([import('three/webgpu'), pickScene()]);
    THREE = three;
    if (engine.stopped) return engine;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGPURenderer({ canvas: canvas, antialias: true });

    await renderer.init();
    if (engine.stopped) {
        renderer.dispose();
        return engine;
    }
    renderer.setPixelRatio(RENDER.PIXEL_RATIO);
    renderer.setSize(window.innerWidth, window.innerHeight);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);

    console.log('[engine] chosen scene:', chosenPicker.name);
    const updateSceneAnimation = chosenPicker(scene, camera);

    const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    let frame;
    let lastRender = -Infinity;
    let lastTick = -Infinity;
    let tickGap = 1000 / 60; // smoothed time between animation frames
    function tick(time) {
        frame = requestAnimationFrame(tick);
        tickGap += (Math.min(time - lastTick, 100) - tickGap) * 0.1;
        lastTick = time;
        // the cap only applies above 60hz. at 60 (safari, most screens)
        // skipping frames would halve it to 30, so every frame renders
        const capped = tickGap < 1000 / 61;
        const uncapped = !capped || (updateSceneAnimation.uncapped?.() ?? false);
        // small slack so frames that arrive slightly early still render
        if (!uncapped && time - lastRender < 1000 / RENDER.MAX_FPS - 4) return;
        lastRender = time;
        updateSceneAnimation(time);
        renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(tick);

    engine.stop = () => {
        engine.stopped = true;
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', onResize);
        updateSceneAnimation.dispose?.();
        renderer.dispose();
    };
    return engine;
}

// the canvas is transition:persist, so it survives navigation between pages
// that share BaseLayout. pages without it (toys) drop it; coming back gives
// a fresh canvas, which gets a fresh scene.
let current = null;

// ?noscene in the url skips the scene for the whole visit, for comparing
// performance (links drop the query, so it's read once here)
const noScene = new URLSearchParams(location.search).has('noscene');

function syncEngine() {
    if (noScene) return;
    const canvas = document.querySelector('#bg-canvas');
    if (current && current.canvas === canvas) return;

    if (current) current.stop();
    current = null;
    if (!canvas) return;

    const pending = { canvas, stop: () => { pending.cancelled = true; } };
    current = pending;
    initEngine(canvas)
        .then((engine) => {
            if (current !== pending) return engine.stop();
            if (pending.cancelled) return engine.stop();
            current = engine;
        })
        .catch(err => console.error("Engine failed to boot:", err));
}

// first boot waits for the page to finish loading and the main thread to go
// idle. later navigations reuse the running scene, so they're unaffected
function startWhenIdle() {
    const start = () => {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(syncEngine, { timeout: 2000 });
        } else {
            setTimeout(syncEngine, 200);
        }
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });

    document.addEventListener('astro:page-load', () => {
        if (current || document.readyState === 'complete') syncEngine();
    });
}

startWhenIdle();
