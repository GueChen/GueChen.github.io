import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { createDemoShell, applyResponsiveSplitLayout } from "./demo_split_layout.js";

const container = document.getElementById("ledge_slope_demo");

if (!container) {
  throw new Error("Missing ledge_slope_demo container.");
}

const shell = createDemoShell(container, {
  layoutId: "ledgeSlopeLayout",
  viewportId: "ledgeSlopeViewport",
  panelId: "ledgeSlopePanel",
  title: "rcFilterLedgeSpans",
  headerRight: "邻居坡度判定",
  viewportHeight: 300,
  maxWidth: "760px",
  panelBodyHtml: `
    <label style="display:block; margin-bottom:10px;">
      <span style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; font-size:12px; font-weight:350;">
        <span>Lowest Neighbor</span>
        <span id="ledgeSlopeLowValue">0.0</span>
      </span>
      <input id="ledgeSlopeLowSlider" type="range" min="0.0" max="1.0" step="0.1" value="0.0" style="display:block; width:100%; appearance:auto; -webkit-appearance:auto; accent-color:#60a5fa;">
    </label>
    <label style="display:block; margin-bottom:10px;">
      <span style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; font-size:12px; font-weight:350;">
        <span>Highest Neighbor</span>
        <span id="ledgeSlopeHighValue">0.9</span>
      </span>
      <input id="ledgeSlopeHighSlider" type="range" min="0.0" max="1.6" step="0.1" value="0.9" style="display:block; width:100%; appearance:auto; -webkit-appearance:auto; accent-color:#60a5fa;">
    </label>
    <label style="display:block;">
      <span style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; font-size:12px; font-weight:350;">
        <span>walkableClimb</span>
        <span id="ledgeSlopeClimbValue">0.8</span>
      </span>
      <input id="ledgeSlopeClimbSlider" type="range" min="0.2" max="1.2" step="0.1" value="0.8" style="display:block; width:100%; appearance:auto; -webkit-appearance:auto; accent-color:#60a5fa;">
    </label>
    <div style="margin:12px 0 10px; height:1px; background:rgba(226,232,240,0.28);"></div>
    <div id="ledgeSlopeStatus" style="color:#cbd5e1;"></div>
  `,
});

const { viewport, layout, panel } = shell;
const lowSlider = document.getElementById("ledgeSlopeLowSlider");
const highSlider = document.getElementById("ledgeSlopeHighSlider");
const climbSlider = document.getElementById("ledgeSlopeClimbSlider");
const lowValue = document.getElementById("ledgeSlopeLowValue");
const highValue = document.getElementById("ledgeSlopeHighValue");
const climbValue = document.getElementById("ledgeSlopeClimbValue");
const status = document.getElementById("ledgeSlopeStatus");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 100);
camera.position.set(4.3, 3.1, 4.8);

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
scene.add(new THREE.GridHelper(5, 5, 0x555555, 0x888888));

function createSpan(color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.35, 0.9),
    new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.86 })
  );
}

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

const lowSpan = createSpan(0x22c55e);
lowSpan.position.set(-1, 0.175, 0);
scene.add(lowSpan);

const centerSpan = createSpan(0x3b82f6);
centerSpan.position.set(0, 0.175, 0);
scene.add(centerSpan);

const highSpan = createSpan(0xf59e0b);
highSpan.position.set(1, 0.175, 0);
scene.add(highSpan);

const lowTopSurface = createTopSurface(0x86efac);
scene.add(lowTopSurface);

const centerTopSurface = createTopSurface(0x93c5fd);
scene.add(centerTopSurface);

const highTopSurface = createTopSurface(0xfcd34d);
scene.add(highTopSurface);

const slopeGeometry = new THREE.BufferGeometry();
const slopeMaterial = new THREE.MeshPhongMaterial({
  color: 0xe0f2fe,
  transparent: true,
  opacity: 0.28,
  side: THREE.DoubleSide,
});
const slopePlane = new THREE.Mesh(slopeGeometry, slopeMaterial);
scene.add(slopePlane);

const slopeHypotenuse = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.9 })
);
scene.add(slopeHypotenuse);

const climbArrowGroup = new THREE.Group();
scene.add(climbArrowGroup);

const climbArrowBody = new THREE.Mesh(
  new THREE.CylinderGeometry(0.03, 0.03, 1, 20),
  new THREE.MeshPhongMaterial({ color: 0xef4444, transparent: true, opacity: 0.75 })
);
climbArrowGroup.add(climbArrowBody);

const climbArrowHead = new THREE.Mesh(
  new THREE.ConeGeometry(0.09, 0.16, 20),
  new THREE.MeshPhongMaterial({ color: 0xef4444, transparent: true, opacity: 0.92 })
);
climbArrowGroup.add(climbArrowHead);

const baseEdge = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0x0c4a6e, transparent: true, opacity: 0.7 })
);
scene.add(baseEdge);

function updateScene() {
  const lowTop = parseFloat(lowSlider.value);
  let highTop = parseFloat(highSlider.value);
  const walkableClimb = parseFloat(climbSlider.value);

  if (highTop < lowTop) {
    highTop = lowTop;
    highSlider.value = highTop.toFixed(1);
  }

  lowValue.textContent = lowTop.toFixed(1);
  highValue.textContent = highTop.toFixed(1);
  climbValue.textContent = walkableClimb.toFixed(1);

  lowSpan.position.set(-1, lowTop - 0.175, 0);
  highSpan.position.set(1, highTop - 0.175, 0);
  lowTopSurface.position.set(-1, lowTop + 0.01, 0);
  centerTopSurface.position.set(0, 0.35 + 0.01, 0);
  highTopSurface.position.set(1, highTop + 0.01, 0);

  const spread = highTop - lowTop;
  const filtered = spread > walkableClimb;
  centerSpan.material.color.setHex(filtered ? 0xef4444 : 0x3b82f6);
  centerTopSurface.material.color.setHex(filtered ? 0xfca5a5 : 0x93c5fd);
  centerTopSurface.material.emissive.setHex(filtered ? 0xef4444 : 0x60a5fa);
  lowTopSurface.material.emissive.setHex(0x22c55e);
  highTopSurface.material.emissive.setHex(0xf59e0b);

  const slopeVertices = new Float32Array([
    -1, lowTop + 0.01, -0.45,
    1, highTop + 0.01, -0.45,
    1, highTop + 0.01, 0.45,
    -1, lowTop + 0.01, 0.45,
  ]);
  slopeGeometry.setAttribute("position", new THREE.BufferAttribute(slopeVertices, 3));
  slopeGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  slopeGeometry.computeVertexNormals();

  slopeHypotenuse.geometry.setFromPoints([
    new THREE.Vector3(-1, lowTop + 0.03, 0),
    new THREE.Vector3(1, highTop + 0.03, 0),
  ]);
  baseEdge.geometry.setFromPoints([
    new THREE.Vector3(-1, lowTop + 0.03, 0),
    new THREE.Vector3(1, lowTop + 0.03, 0),
  ]);

  const arrowHeadHeight = 0.16;
  const arrowBodyHeight = Math.max(0.08, walkableClimb - arrowHeadHeight);
  climbArrowGroup.position.set(1, lowTop + 0.03, 0);
  climbArrowBody.scale.y = arrowBodyHeight;
  climbArrowBody.position.y = arrowBodyHeight * 0.5;
  climbArrowHead.position.y = arrowBodyHeight + arrowHeadHeight * 0.5;

  status.innerHTML =
    `源码分支：<cvar>(asmax - asmin) > walkableClimb</cvar>` +
    `<br>当前可达邻居高度跨度 = ${spread.toFixed(1)}，walkableClimb = ${walkableClimb.toFixed(1)}` +
    `<br>浅蓝色半透明平面表示邻居上表面形成的坡度范围，红色箭头表示 walkableClimb。` +
    `<br>${filtered ? "邻居高度跨度过大，当前 Span 会被过滤。" : "邻居仍在可接受坡度范围内。"} `;
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

[lowSlider, highSlider, climbSlider].forEach((slider) => slider.addEventListener("input", updateScene));
window.addEventListener("resize", onResize);

updateScene();
onResize();
animate();
