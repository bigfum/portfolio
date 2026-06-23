import * as THREE from 'three/webgpu';

const canvas = document.querySelector('#bg-canvas');

// sc 1: box
function loadSceneA(scene) {
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
function loadSceneB(scene) {
    const geometry = new THREE.TorusGeometry(0.7, 0.2, 8, 24);
    const material = new THREE.MeshBasicMaterial({ color: 0x00aaff, wireframe: true });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    return function animate(time) {
        mesh.rotation.y = time * 0.001;
        mesh.rotation.z = time * 0.001;
    };
}

async function initEngine() {
    const canvas = document.querySelector('#bg-canvas');
    if (!canvas) return;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGPURenderer({ canvas: canvas, antialias: true });

    await renderer.init();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 3;

    const scenePickers = [loadSceneA, loadSceneB];
    const chosenPicker = scenePickers[Math.floor(Math.random() * scenePickers.length)];
    const updateSceneAnimation = chosenPicker(scene);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function tick(time) {
        updateSceneAnimation(time);
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

if (!window.bgEngineStarted) {
    window.bgEngineStarted = true;
    initEngine().catch(err => console.error("Engine failed to boot:", err));
} else {
    console.log("Engine already running seamlessly in background.");
}