import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import init, { FluidSim } from './fluid_physics/pkg/fluid_physics.js';

class cell 
{
  constructor(x, y, z, d)
  {
    this.x = x;
    this.y = y;
    this.z = z;
    this.d = d;
  }
  
  getX() { return this.x; }
  getY() { return this.y; }
  getZ() { return this.z; }
  getD() { return this.d; }
  setX(x) { this.x = x; }
  setY(y) { this.y = y; }
  setZ(z) { this.z = z; }
  setD(d) { this.d = d; }
}

const canvas = document.getElementById('c');
const view = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(view.clientWidth, view.clientHeight); 
renderer.setClearColor(0x000000);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const clock = new THREE.Clock();

await init();
const sim = new FluidSim(10, 10, 10);
window.sim = sim;

const CELL_SIZE = 0.5;
const geometry = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);

const rawMatrixInitial = Array.from(sim.raw_3d_matrix());
const xLength = rawMatrixInitial[0];
const yLength = rawMatrixInitial[1];
const zLength = rawMatrixInitial[2];
console.log("Creation:");
console.log(`Grid size: ${xLength} x ${yLength} x ${zLength}`);

// Center of the scaled grid
const gridCenterX = (xLength * CELL_SIZE) / 2;
const gridCenterY = (yLength * CELL_SIZE) / 2;
const gridCenterZ = (zLength * CELL_SIZE) / 2;

const camera = new THREE.PerspectiveCamera(45, view.clientWidth / view.clientHeight, 0.1, 1000);
camera.position.set(gridCenterX + 10, gridCenterY + 10, gridCenterZ + 10);
camera.lookAt(gridCenterX, gridCenterY, gridCenterZ);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2;
controls.maxDistance = 50;
controls.minPolarAngle = 0.5;
controls.maxPolarAngle = 1.5;
controls.autoRotate = false;
controls.target = new THREE.Vector3(gridCenterX, gridCenterY, gridCenterZ);
controls.update();

const groundGeometry = new THREE.PlaneGeometry(
  xLength * CELL_SIZE + 4,
  zLength * CELL_SIZE + 4,
  32, 32
);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x555555,
  side: THREE.DoubleSide
});
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.castShadow = false;
groundMesh.receiveShadow = true;
groundMesh.position.set(gridCenterX, -0.05, gridCenterZ);
scene.add(groundMesh);

const spotLight = new THREE.SpotLight(0xffffff, 3000, 100, 0.22, 1);
spotLight.position.set(gridCenterX, 25, gridCenterZ);
spotLight.castShadow = true;
spotLight.shadow.bias = -0.0001;
scene.add(spotLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

window.addEventListener('resize', () => {
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(view.clientWidth, view.clientHeight);
});

const PAN_SPEED = 0.05;
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const panX = event.deltaX * PAN_SPEED;
  const panZ = event.deltaY * PAN_SPEED;

  const offset = new THREE.Vector3()
    .addScaledVector(right, panX)
    .addScaledVector(forward, -panZ);

  controls.target.add(offset);
  camera.position.add(offset);
  controls.update();
}, { passive: false });

const meshPool = [];

function rebuildScene() {
  for (const m of meshPool) scene.remove(m);
  meshPool.length = 0;

  const rawMatrix = Array.from(sim.raw_3d_matrix());
  rawMatrix.splice(0, 3); // remove x,y,z header

  // flat array: index = x + y*xLength + z*xLength*yLength
  for (let z = 0; z < zLength; z++) {
    for (let y = 0; y < yLength; y++) {
      for (let x = 0; x < xLength; x++) {
        const idx = x + y * xLength + z * xLength * yLength;
        const d = rawMatrix[idx];
        if (d < 0.001) continue;

        const isSolid = d >= 0.99;
        const mat = new THREE.MeshPhongMaterial({
          color: isSolid ? 0x888888 : 0x0044ff,
          transparent: !isSolid,
          opacity: isSolid ? 1.0 : Math.min(d, 0.8),
          depthWrite: isSolid,
        });

        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.set(x * CELL_SIZE, y * CELL_SIZE, z * CELL_SIZE);
        scene.add(mesh);
        meshPool.push(mesh);
      }
    }
  }
}

sim.set_density(5, 8, 5, 1.0);
sim.set_density(5, 7, 5, 1.0);
sim.set_density(5, 6, 5, 1.0);

let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  sim.increment_dt();
  rebuildScene();
  controls.update();
  renderer.render(scene, camera);
}


animate();