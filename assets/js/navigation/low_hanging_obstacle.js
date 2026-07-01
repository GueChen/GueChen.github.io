import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const container = document.getElementById("low_hanging_obstacle_demo");

if (!container) {
  throw new Error("Missing low_hanging_obstacle_demo container.");
}

const bottomSlider = document.getElementById("lowHangingBottomSlider");
const climbSlider = document.getElementById("lowHangingClimbSlider");
const status = document.getElementById("lowHangingStatus");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(3.8, 2.8, 4.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setClearColor(0x000000, 0.18);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableZoom = false;
controls.target.set(0, 0.8, 0);
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(4, 6, 5);
scene.add(light);

const grid = new THREE.GridHelper(4, 8, 0x555555, 0x888888);
scene.add(grid);

const cellOutline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.02, 1)),
  new THREE.LineBasicMaterial({ color: 0xffffff })
);
cellOutline.position.y = 0.01;
scene.add(cellOutline);

const lowerGeometry = new THREE.BoxGeometry(1, 0.35, 1);
const upperGeometry = new THREE.BoxGeometry(1, 0.25, 1);
const lowerMaterial = new THREE.MeshPhongMaterial({ color: 0x2f9e44, transparent: true, opacity: 0.92 });
const upperMaterial = new THREE.MeshPhongMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.85 });
const fallbackUpperMaterial = new THREE.MeshPhongMaterial({ color: 0x6b7280, transparent: true, opacity: 0.7 });
const climbBodyMaterial = new THREE.MeshPhongMaterial({
  color: 0xdc2626,
  transparent: true,
  opacity: 0.5,
});
const climbHeadMaterial = new THREE.MeshPhongMaterial({
  color: 0xdc2626,
  transparent: true,
  opacity: 0.72,
});

const lowerSpan = new THREE.Mesh(lowerGeometry, lowerMaterial);
lowerSpan.position.y = 0.175;
scene.add(lowerSpan);

const upperSpan = new THREE.Mesh(upperGeometry, upperMaterial);
scene.add(upperSpan);

const climbArrowGroup = new THREE.Group();
scene.add(climbArrowGroup);

const climbArrowBody = new THREE.Mesh(
  new THREE.CylinderGeometry(0.055, 0.055, 1, 20),
  climbBodyMaterial
);
climbArrowGroup.add(climbArrowBody);

const climbArrowHead = new THREE.Mesh(
  new THREE.ConeGeometry(0.12, 0.22, 24),
  climbHeadMaterial
);
climbArrowGroup.add(climbArrowHead);

function updateScene() {
  const lowerTop = 0.35;
  const upperBottom = parseFloat(bottomSlider.value);
  const upperHeight = 0.25;
  const upperTop = upperBottom + upperHeight;
  const walkableClimb = parseFloat(climbSlider.value);

  const deltaHeight = Math.abs(upperTop - lowerTop);
  const marksUpperWalkable = deltaHeight <= walkableClimb;

  upperSpan.position.y = upperBottom + upperHeight * 0.5;
  upperSpan.material = marksUpperWalkable ? upperMaterial : fallbackUpperMaterial;

  lowerSpan.material.color.setHex(0x2f9e44);
  const headHeight = 0.22;
  const bodyHeight = Math.max(0.08, walkableClimb - headHeight);
  climbArrowGroup.position.set(0, lowerTop, 0);
  climbArrowBody.scale.y = bodyHeight;
  climbArrowBody.position.y = bodyHeight * 0.5;
  climbArrowHead.position.y = bodyHeight + headHeight * 0.5;

  status.innerHTML =
    `Δheight = ${deltaHeight.toFixed(1)}，walkableClimb = ${walkableClimb.toFixed(1)}：` +
    `${marksUpperWalkable ? "上方 Span 可行走" : "上方 Span 不可行走"}`;
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

[bottomSlider, climbSlider].forEach((slider) => {
  slider.addEventListener("input", updateScene);
});

window.addEventListener("resize", () => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

updateScene();
animate();
