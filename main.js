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
const sim = new FluidSim(20, 16, 20);
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
controls.minDistance   = 3;
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
const FLOOR_Y = 1;

// 9 buildings: [x_start, z_start, height_in_cells]
// 3x3 grid, each building 2x2 footprint, 5-cell spacing (2 bldg + 3 street)
const BLDG_DEFS = [
  [3,  3,  5],  [8,  3,  7],  [13,  3,  6],
  [3,  8,  8],  [8,  8,  5],  [13,  8,  7],
  [3, 13,  6],  [8, 13,  5],  [13, 13,  8],
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
    for (let x = bx; x <= bx + 1; x++)
      for (let z = bz; z <= bz + 1; z++)
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
    const w = 2 * CELL_SIZE;
    const d = 2 * CELL_SIZE;
    const h = bh * CELL_SIZE;

    // Main building body
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshPhongMaterial({ color: BLDG_COLORS[idx], shininess: 20 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.position.set(
      (bx + 1) * CELL_SIZE,
      (FLOOR_Y + bh / 2) * CELL_SIZE,
      (bz + 1) * CELL_SIZE
    );
    scene.add(mesh);

    // Roof cap
    const roofGeo = new THREE.BoxGeometry(w + 0.05, 0.06, d + 0.05);
    const roofMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const roof    = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(
      (bx + 1) * CELL_SIZE,
      (FLOOR_Y + bh) * CELL_SIZE + 0.03,
      (bz + 1) * CELL_SIZE
    );
    scene.add(roof);

    // Windows (small bright planes on each face per floor)
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
    const winGeo = new THREE.PlaneGeometry(0.1, 0.12);
    const cx     = (bx + 1) * CELL_SIZE;
    const cz     = (bz + 1) * CELL_SIZE;

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
const voxelGeo = new THREE.BoxGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9, CELL_SIZE * 0.9);
const meshPool = [];

function rebuildScene() {
  for (const m of meshPool) {
    scene.remove(m);
    m.material.dispose();
  }
  meshPool.length = 0;

  const raw = sim.raw_3d_matrix();
  for (let i = 3; i < raw.length; i += 4) {
    const gx = raw[i];
    const gy = raw[i + 1];
    const gz = raw[i + 2];
    const d  = raw[i + 3];
    if (d < 0.04) continue;

    const t   = Math.min(d, 1.0);
    const mat = new THREE.MeshPhongMaterial({
      color:       new THREE.Color(0.05, 0.3 + t * 0.25, 0.9),
      transparent: true,
      opacity:     0.3 + t * 0.65,
      depthWrite:  false,
      shininess:   100,
    });

    const mesh = new THREE.Mesh(voxelGeo, mat);
    mesh.position.set(gx * CELL_SIZE, gy * CELL_SIZE, gz * CELL_SIZE);
    scene.add(mesh);
    meshPool.push(mesh);
  }
}

// Water source: left face (x=1), flows right (+x direction)
// Spans full z-width of the city block and a few rows above floor
const POUR_X  = 1;
const POUR_Y0 = FLOOR_Y + 1;
const POUR_Y1 = FLOOR_Y + 3;
const POUR_Z0 = 2;
const POUR_Z1 = NZ - 3;

function pourWater() {
  for (let y = POUR_Y0; y <= POUR_Y1; y++) {
    for (let z = POUR_Z0; z <= POUR_Z1; z++) {
      sim.set_density(POUR_X, y, z, 1.0);
      sim.set_velocity(POUR_X, y, z, 3.0, 0.0, 0.0);  // flowing right
    }
  }
}

// Animation
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.016);
  lastTime  = now;

  pourWater();
  sim.step(dt);
  rebuildScene();
  controls.update();
  renderer.render(scene, camera);
}

animate();