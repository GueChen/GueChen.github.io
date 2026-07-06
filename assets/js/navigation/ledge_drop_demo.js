import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { createDemoShell, applyResponsiveSplitLayout } from "./demo_split_layout.js";

const container = document.getElementById("ledge_drop_demo");

if (!container) {
  throw new Error("Missing ledge_drop_demo container.");
}

const shell = createDemoShell(container, {
  layoutId: "ledgeDropLayout",
  viewportId: "ledgeDropViewport",
  panelId: "ledgeDropPanel",
  title: "rcFilterLedgeSpans",
  headerRight: "邻居落差判定",
  viewportHeight: 300,
  maxWidth: "760px",
  panelBodyHtml: `
    <label style="display:block; margin-bottom:10px;">
      <span style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; font-size:12px; font-weight:350;">
        <span>Neighbor Drop</span>
        <span id="ledgeDropValue">0.8</span>
      </span>
      <input id="ledgeDropSlider" type="range" min="0.2" max="1.6" step="0.1" value="0.8" style="display:block; width:100%; appearance:auto; -webkit-appearance:auto; accent-color:#60a5fa;">
    </label>
    <label style="display:block;">
      <span style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; font-size:12px; font-weight:350;">
        <span>walkableClimb</span>
        <span id="ledgeDropClimbValue">0.8</span>
      </span>
      <input id="ledgeDropClimbSlider" type="range" min="0.2" max="1.2" step="0.1" value="0.8" style="display:block; width:100%; appearance:auto; -webkit-appearance:auto; accent-color:#60a5fa;">
    </label>
    <div style="margin:12px 0 10px; height:1px; background:rgba(226,232,240,0.28);"></div>
    <div id="ledgeDropStatus" style="color:#cbd5e1;"></div>
  `,
});

const { viewport, layout, panel } = shell;
const dropSlider = document.getElementById("ledgeDropSlider");
const climbSlider = document.getElementById("ledgeDropClimbSlider");
const dropValue = document.getElementById("ledgeDropValue");
const climbValue = document.getElementById("ledgeDropClimbValue");
const status = document.getElementById("ledgeDropStatus");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 100);
camera.position.set(3.8, 2.9, 4.6);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.setClearColor(0x000000, 0.16);
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableZoom = false;
controls.target.set(0, 0.55, 0);
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 1.4));
const light = new THREE.DirectionalLight(0xffffff, 1.1);
light.position.set(4, 6, 5);
scene.add(light);
scene.add(new THREE.GridHelper(4, 4, 0x555555, 0x888888));

function createSpan(color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.35, 1),
    new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.86 })
  );
}

const currentSpan = createSpan(0x3b82f6);
currentSpan.position.set(-0.5, 0.175, 0);
scene.add(currentSpan);

const safeNeighborSpan = createSpan(0x22c55e);
safeNeighborSpan.position.set(-1.5, 0.175, 0);
scene.add(safeNeighborSpan);

const neighborSpan = createSpan(0x22c55e);
neighborSpan.position.set(0.5, 0.175, 0);
scene.add(neighborSpan);

function createTopSurface(color) {
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshPhongMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      emissive: color,
      emissiveIntensity: 0.18,
    })
  );
  surface.rotation.x = -Math.PI * 0.5;
  return surface;
}

const currentTopSurface = createTopSurface(0x93c5fd);
scene.add(currentTopSurface);

const safeNeighborTopSurface = createTopSurface(0x86efac);
scene.add(safeNeighborTopSurface);

const neighborTopSurface = createTopSurface(0x86efac);
scene.add(neighborTopSurface);

const arrowGroup = new THREE.Group();
scene.add(arrowGroup);

const arrowBody = new THREE.Mesh(
  new THREE.CylinderGeometry(0.04, 0.04, 1, 20),
  new THREE.MeshPhongMaterial({ color: 0xdc2626, transparent: true, opacity: 0.55 })
);
arrowGroup.add(arrowBody);

const arrowHead = new THREE.Mesh(
  new THREE.ConeGeometry(0.11, 0.2, 20),
  new THREE.MeshPhongMaterial({ color: 0xdc2626, transparent: true, opacity: 0.75 })
);
arrowGroup.add(arrowHead);

function updateScene() {
  const drop = parseFloat(dropSlider.value);
  const walkableClimb = parseFloat(climbSlider.value);
  const currentTop = 0.35;
  const neighborTop = currentTop - drop;
  const neighborBottom = neighborTop - 0.35;
  const delta = neighborTop - currentTop;
  const filtered = delta < -walkableClimb;

  dropValue.textContent = drop.toFixed(1);
  climbValue.textContent = walkableClimb.toFixed(1);

  neighborSpan.position.y = neighborBottom + 0.175;
  safeNeighborSpan.position.set(-1.5, 0.175, 0);
  currentSpan.material.color.setHex(filtered ? 0xef4444 : 0x3b82f6);
  safeNeighborSpan.material.color.setHex(0x22c55e);
  neighborSpan.material.color.setHex(0x22c55e);
  currentTopSurface.material.color.setHex(filtered ? 0xfca5a5 : 0x93c5fd);
  currentTopSurface.material.emissive.setHex(filtered ? 0xef4444 : 0x60a5fa);
  safeNeighborTopSurface.material.color.setHex(0x86efac);
  safeNeighborTopSurface.material.emissive.setHex(0x22c55e);
  neighborTopSurface.material.color.setHex(0x86efac);
  neighborTopSurface.material.emissive.setHex(0x22c55e);
  currentTopSurface.position.set(0, currentTop + 0.01, 0);
  safeNeighborTopSurface.position.set(-1.5, currentTop + 0.01, 0);
  neighborTopSurface.position.set(0.5, neighborTop + 0.01, 0);

  const headHeight = 0.2;
  const bodyHeight = Math.max(0.08, walkableClimb - headHeight);
  arrowGroup.position.set(0, neighborTop, 0);
  arrowGroup.rotation.z = 0;
  arrowBody.scale.y = bodyHeight;
  arrowBody.position.y = bodyHeight * 0.5;
  arrowHead.position.y = bodyHeight + headHeight * 0.5;

  status.innerHTML =
    `源码分支：<cvar>minh < -walkableClimb</cvar>` +
    `<br>当前邻居高度差 = ${Math.abs(delta).toFixed(1)}，walkableClimb = ${walkableClimb.toFixed(1)}` +
    `<br>红色箭头表示允许攀爬的最大高度。` +
    `<br>${filtered ? "虽然左侧邻居可达，但右侧邻居无法攀爬到当前 Span，因此当前 Span 仍会被过滤。" : "左右邻居都仍可攀爬到当前 Span，当前 Span 保留。"} `;
}

function onResize() {
  applyResponsiveSplitLayout(container, layout, viewport, panel, {
    breakpoint: 700,
    wideViewportFlex: "1 1 0%",
    widePanelFlex: "1 1 0%",
    widePanelWidth: "auto",
    stackedViewportFlex: "1 1 300px",
    stackedPanelFlex: "1 1 240px",
  });

  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

[dropSlider, climbSlider].forEach((slider) => slider.addEventListener("input", updateScene));
window.addEventListener("resize", onResize);

updateScene();
onResize();
animate();
