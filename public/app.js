import * as THREE from 'three/webgpu';
import { initPathScene } from './scenes/rooms.js';
import { loadSceneC } from './scenes/fire.js';
import { loadGraphScene } from './scenes/graph.js';

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

// older scenes: loadSceneA, loadSceneB, initPathScene, loadSceneC
const scenePickers = [loadGraphScene];

async function initEngine(canvas) {
    const engine = { canvas, stopped: false, stop: () => { engine.stopped = true; } };

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGPURenderer({ canvas: canvas, antialias: true });

    await renderer.init();
    if (engine.stopped) {
        renderer.dispose();
        return engine;
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);

    const chosenPicker = scenePickers[Math.floor(Math.random() * scenePickers.length)];
    console.log('[engine] chosen scene:', chosenPicker.name);
    const updateSceneAnimation = chosenPicker(scene, camera);

    const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    let frame;
    function tick(time) {
        updateSceneAnimation(time);
        renderer.render(scene, camera);
        frame = requestAnimationFrame(tick);
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

function syncEngine() {
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

syncEngine();
document.addEventListener('astro:page-load', syncEngine);
