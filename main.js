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
  
  getX()
  {
    return this.x;
  }

  getY()
  {
    return this.y;
  }

  getZ()
  {
    return this.z;
  }

  getD()
  {
    return this.d;
  }
  
  setX(x)
  {
    this.x = x;
  }

  setY(y)
  {
    this.y = y;
  }

  setZ(z)
  {
    this.z = z;
  }

  setD(d)
  {
    this.d = d;
  }
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

await init();
const sim = new FluidSim(10, 10, 10);
sim.set_density(5, 5, 5, 1.0);
sim.set_density(3, 3, 3, 0.5);
const rawMatrix = Array.from(sim.raw_3d_matrix());
const cityGrid = [];
const xLength = rawMatrix.splice(0, 1)[0];
const yLength = rawMatrix.splice(0, 1)[0];
const zLength = rawMatrix.splice(0, 1)[0];
console.log("Creation:");

for(let i = 0; i < rawMatrix.length; i = i + 4)
{
  cityGrid.push(new cell(rawMatrix[i], rawMatrix[i + 1], rawMatrix[i + 2], rawMatrix[i + 3]));
  console.log("" + rawMatrix[i] + " " + rawMatrix[i + 1] + " " + rawMatrix[i + 2] + " " + rawMatrix[i + 3]);
}
console.log("");
console.log("cityGrid length:", cityGrid.length);
console.log("Non-zero cells:", cityGrid.filter(c => c.d > 0).length);

let xLocation = 0;
let yLocation = 0;
let zLocation = 0;
let cDensity = 0;
const geometry = new THREE.BoxGeometry(.1, .1, .1);
let nothing = new THREE.Color('white');
let blue = new THREE.Color('blue');
let solid = new THREE.Color('gray');
let material = new THREE.MeshPhongMaterial({color: nothing});

const cubeGrid = [];
console.log("Adding to display");
for(let i = 0; i < cityGrid.length; i++){
  xLocation = cityGrid[i].getX();
  yLocation = cityGrid[i].getY();
  zLocation = cityGrid[i].getZ();
  cDensity = cityGrid[i].getD();

  let color, opacity;

  if(cDensity < 0.001){
    continue;
  }
  else if(cDensity==1){
    color = 0x888888;
    opacity = 1.0;
  }
  else{
    color = 0x0044ff;
    opacity = cDensity;
  }

  const material = new THREE.MeshPhongMaterial({
    color: color,
    transparent: true,
    opacity: opacity,
    depthWrite: opacity < 1
    });

  const cube = new THREE.Mesh(geometry, material);
  cube.position.set(xLocation, yLocation, zLocation);
  scene.add(cube);
  console.log(xLocation + " " + yLocation +" " + zLocation +" " +cDensity);
  cubeGrid.push(cube);
}

const camera = new THREE.PerspectiveCamera(45, view.clientWidth / view.clientHeight, 1, 1000);
camera.position.set(15, 15, 15);
camera.lookAt(0, 0, 0);


const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 50;
controls.minPolarAngle = 0.5;
controls.maxPolarAngle = 1.5;
controls.autoRotate = false;
controls.target = new THREE.Vector3(5, 5, 5);
camera.position.set(20, 20, 20);
controls.update();

const groundGeometry = new THREE.PlaneGeometry(20, 20, 32, 32);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x555555,
  side: THREE.DoubleSide
});
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.castShadow = false;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const spotLight = new THREE.SpotLight(0xffffff, 3000, 100, 0.22, 1);
spotLight.position.set(0, 25, 0);
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

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();