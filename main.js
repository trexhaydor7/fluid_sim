import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import init, { FluidSim } from './fluid_physics/pkg/fluid_physics.js';

const canvas = document.getElementById('c');
const view   = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(view.clientWidth, view.clientHeight);
renderer.setClearColor(0x111111);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();

await init();

// Grid: 20 x 16 x 20
const sim = new FluidSim(40, 32, 40);
window.sim = sim;

const CELL_SIZE = 0.5;
const raw0 = sim.raw_3d_matrix();
const NX = raw0[0];
const NY = raw0[1];
const NZ = raw0[2];
console.log(`Grid: ${NX} x ${NY} x ${NZ}`);

const gridCenterX = (NX * CELL_SIZE) / 2;
const gridCenterY = (NY * CELL_SIZE) / 2;
const gridCenterZ = (NZ * CELL_SIZE) / 2;

// Camera — positioned to the left and slightly above to watch water flow in
const camera = new THREE.PerspectiveCamera(50, view.clientWidth / view.clientHeight, 0.1, 1000);
camera.position.set(-3, gridCenterY + 4, gridCenterZ);
camera.lookAt(gridCenterX, CELL_SIZE * 3, gridCenterZ);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan     = false;
controls.minDistance   = 1;
controls.maxDistance   = 60;
controls.minPolarAngle = 0.1;
controls.maxPolarAngle = 1.5;
controls.target.set(gridCenterX, CELL_SIZE * 3, gridCenterZ);
controls.update();

// Lights
const spot = new THREE.SpotLight(0xffffff, 2000, 120, 0.3, 1);
spot.position.set(gridCenterX, 20, gridCenterZ);
spot.castShadow  = true;
spot.shadow.bias = -0.0001;
scene.add(spot);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

window.addEventListener('resize', () => {
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(view.clientWidth, view.clientHeight);
});

// Floor
const FLOOR_Y = 2;

// 9 buildings: [x_start, z_start, height_in_cells]
// 3x3 grid, each building 2x2 footprint, 5-cell spacing (2 bldg + 3 street)
const BLDG_DEFS = [
  [ 6,  4,  8],  [14,  4, 10],  [22,  4,  9],
  [ 6, 12, 10],  [14, 12,  8],  [22, 12, 10],
  [ 6, 20,  9],  [14, 20, 10],  [22, 20,  8],
];

const BLDG_COLORS = [
  0x8888aa, 0x9977aa, 0xaa8866,
  0x6688aa, 0xaa9977, 0x778899,
  0x996677, 0xaa8877, 0x7799aa,
];

function buildCity() {
  // Solid floor across entire grid
  for (let x = 0; x < NX; x++)
    for (let z = 0; z < NZ; z++)
      sim.set_active(x, FLOOR_Y, z, false);

  // Mark building cells as solid
  for (const [bx, bz, bh] of BLDG_DEFS) {
    for (let x = bx; x <= bx + 3; x++)
      for (let z = bz; z <= bz + 3; z++)
        for (let y = FLOOR_Y; y <= FLOOR_Y + bh; y++)
          sim.set_active(x, y, z, false);
  }
}

function addCityVisuals() {
  // Pavement slab
  const paveMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a });
  const paveGeo = new THREE.BoxGeometry(NX * CELL_SIZE, CELL_SIZE * 0.3, NZ * CELL_SIZE);
  const pave    = new THREE.Mesh(paveGeo, paveMat);
  pave.receiveShadow = true;
  pave.position.set(gridCenterX, FLOOR_Y * CELL_SIZE - 0.05, gridCenterZ);
  scene.add(pave);

  BLDG_DEFS.forEach(([bx, bz, bh], idx) => {
    const w = 4 * CELL_SIZE;
    const d = 4 * CELL_SIZE;
    const h = bh * CELL_SIZE;

    // Main building body
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshPhongMaterial({ color: BLDG_COLORS[idx], shininess: 20 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.position.set(
      (bx + 2) * CELL_SIZE,
      (FLOOR_Y + bh / 2) * CELL_SIZE,
      (bz + 2) * CELL_SIZE
    );
    scene.add(mesh);

    // Roof cap
    const roofGeo = new THREE.BoxGeometry(w + 0.05, 0.06, d + 0.05);
    const roofMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const roof    = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(
      (bx + 2) * CELL_SIZE,
      (FLOOR_Y + bh) * CELL_SIZE + 0.003,
      (bz + 2) * CELL_SIZE
    );
    scene.add(roof);

    // Windows (small bright planes on each face per floor)
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
    const winGeo = new THREE.PlaneGeometry(0.1, 0.12);
    const cx     = (bx + 2) * CELL_SIZE;
    const cz     = (bz + 2) * CELL_SIZE;

    for (let floor = 0; floor < bh - 1; floor++) {
      const wy = (FLOOR_Y + 0.7 + floor) * CELL_SIZE;
      [[-0.18, 0.1], [0.18, 0.1]].forEach(([wx]) => {
        // front
        const mf = new THREE.Mesh(winGeo, winMat);
        mf.position.set(cx + wx, wy, cz + d / 2 + 0.01);
        scene.add(mf);
        // back
        const mb = new THREE.Mesh(winGeo, winMat);
        mb.position.set(cx + wx, wy, cz - d / 2 - 0.01);
        mb.rotation.y = Math.PI;
        scene.add(mb);
      });
      [[-0.18], [0.18]].forEach(([wz]) => {
        // left
        const ml = new THREE.Mesh(winGeo, winMat);
        ml.position.set(cx - w / 2 - 0.01, wy, cz + wz);
        ml.rotation.y = -Math.PI / 2;
        scene.add(ml);
        // right
        const mr = new THREE.Mesh(winGeo, winMat);
        mr.position.set(cx + w / 2 + 0.01, wy, cz + wz);
        mr.rotation.y = Math.PI / 2;
        scene.add(mr);
      });
    }
  });
}

buildCity();
addCityVisuals();

// Fluid rendering
// Fluid rendering — InstancedMesh: one mesh per density bucket, massive perf win
// over creating/destroying thousands of individual meshes each frame
const BUCKETS = 8;
const voxelGeo = new THREE.BoxGeometry(CELL_SIZE * 0.98, CELL_SIZE * 0.55, CELL_SIZE * 0.98);
const MAX_INSTANCES = 40 * 32 * 40;

const bucketMeshes = Array.from({ length: BUCKETS }, (_, bi) => {
  const t = (bi + 0.5) / BUCKETS;
  const mat = new THREE.MeshPhongMaterial({
    color:       new THREE.Color(0.05, 0.35 + t * 0.2, 0.95),
    transparent: true,
    opacity:     0.18 + t * 0.45,
    depthWrite:  false,
    shininess:   120,
    specular:    new THREE.Color(0.6, 0.8, 1.0),
  });
  const im = new THREE.InstancedMesh(voxelGeo, mat, MAX_INSTANCES);
  im.count = 0;
  im.frustumCulled = false;
  scene.add(im);
  return im;
});

const _dummy = new THREE.Object3D();

function rebuildScene() {
  const raw = sim.raw_3d_matrix();
  const bucketPos = Array.from({ length: BUCKETS }, () => []);

  for (let i = 3; i < raw.length; i += 4) {
    const d = raw[i + 3];
    if (d < 0.04) continue;
    const bi = Math.min(Math.floor(d * BUCKETS), BUCKETS - 1);
    bucketPos[bi].push(raw[i] * CELL_SIZE, raw[i+1] * CELL_SIZE, raw[i+2] * CELL_SIZE);
  }

  for (let b = 0; b < BUCKETS; b++) {
    const pos = bucketPos[b];
    const im  = bucketMeshes[b];
    let n = 0;
    for (let j = 0; j < pos.length; j += 3) {
      _dummy.position.set(pos[j], pos[j+1], pos[j+2]);
      _dummy.updateMatrix();
      im.setMatrixAt(n++, _dummy.matrix);
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
  }
}


// Water source: left face (x=1), flows right (+x direction)
// Inject across all Z columns that aren't blocked by a building at x=6..9
// Buildings are at bz..bz+3 for bz in [4, 12, 20], so blocked z: 4..7, 12..15, 20..23
const POUR_X  = 1;
const POUR_Y0 = FLOOR_Y + 1;
const POUR_Y1 = FLOOR_Y + 1;  // single cell height — pure flat sheet, no vertical head at all

// All open Z columns (not inside a building footprint's Z extent)
const BLOCKED_Z = new Set();
for (const [, bz] of BLDG_DEFS) {
  for (let z = bz; z <= bz + 3; z++) BLOCKED_Z.add(z);
}

function registerInlets() {
  sim.clear_inlets();
  for (let z = 0; z < NZ; z++) {
    if (BLOCKED_Z.has(z)) continue;
    for (let y = POUR_Y0; y <= POUR_Y1; y++) {
      // Seed 3 cells deep so the pressure solver has a wide driving column.
      // Higher vx (5.0) gives enough head to maintain reasonable speed after
      // the 40% cross-section constriction at building faces.
      sim.add_inlet(POUR_X,     y, z, 14.0, 0.0, 0.0);
      sim.add_inlet(POUR_X + 1, y, z, 14.0, 0.0, 0.0);
      sim.add_inlet(POUR_X + 2, y, z, 14.0, 0.0, 0.0);
      sim.add_inlet(POUR_X + 3, y, z, 14.0, 0.0, 0.0);
    }
  }
}
registerInlets();

// Animation
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.016);
  lastTime  = now;

  sim.step(dt);
  rebuildScene();
  controls.update();
  renderer.render(scene, camera);
}

animate();