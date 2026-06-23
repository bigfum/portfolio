import * as THREE from 'three/webgpu';

const TILE_SIZE = 5;
const WALL_HEIGHT = 3.5;
const MOVE_SPEED = 7.0;
const DOOR_HOLE_CHANCE = 0.15;
const INITIAL_SEGMENT_COUNT = 200;

const INITIAL_CAM_OFFSET = new THREE.Vector3(-12.67, 17.85, 20.00);
const INITIAL_CAM_ROT = new THREE.Euler(-0.06, 0.03, -0.34, "YXZ");

let lastTime = 0;
let moveDir = new THREE.Vector3(0, 0, -1);
let cameraTarget = new THREE.Vector3(0, 0, 0);

let camOffset = INITIAL_CAM_OFFSET.clone();
let camRotation = INITIAL_CAM_ROT.clone();

export function initPathScene(scene, camera) {
    camera.far = 20000;
    camera.updateProjectionMatrix();

    const style = document.createElement('style');
    style.innerHTML = `
        .ui-controls { position: absolute; bottom: 30px; left: 30px; z-index: 1000; display: grid; grid-template-columns: repeat(4, 60px); gap: 5px; }
        .ui-btn { width: 60px; height: 50px; background: #ccc; border: 1px solid #000; color: #000; font-weight: bold; cursor: pointer; font-size: 10px; user-select: none; }
        .ui-btn:active { background: #999; }
    `;
    document.head.appendChild(style);

    const div = document.createElement('div');
    div.className = 'ui-controls';

    const createBtn = (label, action) => {
        const btn = document.createElement('button');
        btn.innerHTML = label; btn.className = 'ui-btn';
        btn.onmousedown = btn.ontouchstart = (e) => { e.preventDefault(); window.activeAction = action; };
        btn.onmouseup = btn.onmouseleave = btn.ontouchend = () => { window.activeAction = null; };
        return btn;
    };

    // div.appendChild(createBtn('Left', 'left'));
    // div.appendChild(createBtn('Right', 'right'));
    // div.appendChild(createBtn('Up', 'up'));
    // div.appendChild(createBtn('Down', 'down'));
    // div.appendChild(createBtn('Tilt U', 'tiltU'));
    // div.appendChild(createBtn('Tilt D', 'tiltD'));
    // div.appendChild(createBtn('Roll L', 'rollL'));
    // div.appendChild(createBtn('Roll R', 'rollR'));
    // div.appendChild(createBtn('Turn L', 'turnL'));
    // div.appendChild(createBtn('Turn R', 'turnR'));
    // div.appendChild(createBtn('FOV +', 'fovUp'));
    // div.appendChild(createBtn('FOV -', 'fovDown'));

    // const printBtn = document.createElement('button');
    // printBtn.innerHTML = 'PRINT'; printBtn.className = 'ui-btn';
    // printBtn.onclick = () => {
    //     console.log(`const INITIAL_CAM_OFFSET = new THREE.Vector3(${camOffset.x.toFixed(2)}, ${camOffset.y.toFixed(2)}, ${camOffset.z.toFixed(2)});`);
    //     console.log(`const INITIAL_CAM_ROT = new THREE.Euler(${camRotation.x.toFixed(2)}, ${camRotation.y.toFixed(2)}, ${camRotation.z.toFixed(2)}, "YXZ");`);
    //     alert("Printed to console (F12)");
    // };
    // div.appendChild(printBtn);
    // document.body.appendChild(div);

    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#181818'; ctx.fillRect(0, 0, 64, 64); ctx.fillRect(64, 64, 64, 64);
    const baseTexture = new THREE.CanvasTexture(canvas);
    baseTexture.wrapS = baseTexture.wrapT = THREE.RepeatWrapping;

    const wallMatVis = new THREE.MeshBasicMaterial({ color: 0x151515, side: THREE.FrontSide });
    const eraserMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.BackSide });

    const wallsGroup = new THREE.Group();
    const floorGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE).rotateX(-Math.PI / 2).translate(0, 0, -TILE_SIZE / 2);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: baseTexture });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);

    floorMesh.scale.z = INITIAL_SEGMENT_COUNT;
    baseTexture.repeat.set(1, INITIAL_SEGMENT_COUNT);

    scene.add(floorMesh, wallsGroup);

    let segments = [];
    function addSegment() {
        const segGroup = new THREE.Group();
        const leftWallGeo = new THREE.PlaneGeometry(TILE_SIZE, WALL_HEIGHT).rotateY(Math.PI / 2).translate(-TILE_SIZE / 2, WALL_HEIGHT / 2, -TILE_SIZE / 2);
        const rightWallGeo = new THREE.PlaneGeometry(TILE_SIZE, WALL_HEIGHT).rotateY(-Math.PI / 2).translate(TILE_SIZE / 2, WALL_HEIGHT / 2, -TILE_SIZE / 2);

        const createCarving = (geo) => {
            const g = new THREE.Group();
            g.add(new THREE.Mesh(geo, wallMatVis));
            const e = new THREE.Mesh(geo, eraserMat); e.renderOrder = -1;
            g.add(e); return g;
        };

        if (Math.random() > DOOR_HOLE_CHANCE) segGroup.add(createCarving(leftWallGeo));
        if (Math.random() > DOOR_HOLE_CHANCE) segGroup.add(createCarving(rightWallGeo));

        segGroup.position.set(moveDir.x * (segments.length * TILE_SIZE), 0, moveDir.z * (segments.length * TILE_SIZE));
        wallsGroup.add(segGroup);
        segments.push({ group: segGroup });
    }

    for (let i = 0; i < INITIAL_SEGMENT_COUNT; i++) addSegment();

    return function animate(time) {
        const deltaTime = lastTime === 0 ? 0 : (time - lastTime) * 0.001;
        lastTime = time;

        cameraTarget.addScaledVector(moveDir, MOVE_SPEED * deltaTime);

        const speed = 10 * deltaTime;
        const rotSpeed = 0.5 * deltaTime;

        if (window.activeAction === 'left') camOffset.x -= speed;
        if (window.activeAction === 'right') camOffset.x += speed;
        if (window.activeAction === 'up') camOffset.y += speed;
        if (window.activeAction === 'down') camOffset.y -= speed;
        if (window.activeAction === 'tiltU') camRotation.x += rotSpeed;
        if (window.activeAction === 'tiltD') camRotation.x -= rotSpeed;
        if (window.activeAction === 'rollL') camRotation.z += rotSpeed;
        if (window.activeAction === 'rollR') camRotation.z -= rotSpeed;
        if (window.activeAction === 'turnL') camRotation.y += rotSpeed;
        if (window.activeAction === 'turnR') camRotation.y -= rotSpeed;

        if (window.activeAction === 'fovUp') {
            camera.fov = Math.min(150, camera.fov + 20 * deltaTime);
            camera.updateProjectionMatrix();
        }
        if (window.activeAction === 'fovDown') {
            camera.fov = Math.max(10, camera.fov - 20 * deltaTime);
            camera.updateProjectionMatrix();
        }

        camera.position.set(cameraTarget.x + camOffset.x, camOffset.y, cameraTarget.z + camOffset.z);
        camera.rotation.copy(camRotation);
    };
}