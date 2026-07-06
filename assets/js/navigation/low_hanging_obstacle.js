import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { createDemoShell, applyResponsiveSplitLayout } from "./demo_split_layout.js";

const container = document.getElementById("low_hanging_obstacle_demo");

if (!container) {
  throw new Error("Missing low_hanging_obstacle_demo container.");
}

const shell = createDemoShell(container, {
  layoutId: "lowHangingLayout",
  viewportId: "lowHangingViewport",
  panelId: "lowHangingPanel",
  title: "rcFilterLowHangingWalkableObstacles",
  headerRight: "参数面板",
  viewportHeight: 300,
  maxWidth: "760px",
  panelBodyHtml: `
    <label style="display:block; margin-bottom:10px;">
      <span style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; font-size:12px; font-weight:350;">
        <span>ΔHeight</span>
        <span id="lowHangingBottomValue">1.0</span>
      </span>
      <input id="lowHangingBottomSlider" type="range" min="0.6" max="1.6" step="0.1" value="1.0" style="display:block; width:100%; appearance:auto; -webkit-appearance:auto; accent-color:#60a5fa;">
    </label>
    <label style="display:block;">
      <span style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; font-size:12px; font-weight:350;">
        <span>walkableClimb</span>
        <span id="lowHangingClimbValue">0.8</span>
      </span>
      <input id="lowHangingClimbSlider" type="range" min="0.2" max="1.2" step="0.1" value="0.8" style="display:block; width:100%; appearance:auto; -webkit-appearance:auto; accent-color:#60a5fa;">
    </label>
    <div style="margin:12px 0 10px; height:1px; background:rgba(226,232,240,0.28);"></div>
    <div id="lowHangingStatus" style="color:#cbd5e1;"></div>
  `,
});

const { viewport, layout, panel } = shell;
const bottomSlider = document.getElementById("lowHangingBottomSlider");
const climbSlider = document.getElementById("lowHangingClimbSlider");
const bottomValue = document.getElementById("lowHangingBottomValue");
const climbValue = document.getElementById("lowHangingClimbValue");
const status = document.getElementById("lowHangingStatus");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 100);
camera.position.set(3.8, 2.8, 4.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.setClearColor(0x000000, 0.18);
viewport.appendChild(renderer.domElement);

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
  bottomValue.textContent = upperBottom.toFixed(1);
  climbValue.textContent = walkableClimb.toFixed(1);

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

function onResize() {
  applyResponsiveSplitLayout(container, layout, viewport, panel, {
    breakpoint: 700,
    wideViewportFlex: "1 1 0%",
    widePanelFlex: "1 1 0%",
    widePanelWidth: "auto",
    stackedViewportFlex: "1 1 320px",
    stackedPanelFlex: "1 1 240px",
  });

  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener("resize", onResize);

updateScene();
onResize();
animate();
