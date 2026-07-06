import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { createDemoShell, applyResponsiveSplitLayout } from "./demo_split_layout.js";

const container = document.getElementById("apply_voxel_filter_demo");

if (!container) {
  throw new Error("Missing ApplyVoxelFilter demo container.");
}

const shell = createDemoShell(container, {
  layoutId: "applyVoxelFilterLayout",
  viewportId: "applyVoxelFilterViewport",
  panelId: "applyVoxelFilterPanel",
  title: "ApplyVoxelFilter",
  headerRight: '<span id="applyVoxelRadiusValue">0.0</span>',
  viewportHeight: 320,
  maxWidth: "760px",
  panelBodyHtml: `
    <label style="display:block;">
      <span style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; font-size:12px; font-weight:350;">
        <span>walkableRadius</span>
        <span id="applyVoxelRadiusValue">0.0</span>
      </span>
      <input id="applyVoxelRadiusSlider" type="range" min="0.0" max="1.2" step="0.1" value="0.0" style="display:block; width:100%; appearance:auto; -webkit-appearance:auto; accent-color:#60a5fa;">
    </label>
    <div style="margin:12px 0 10px; height:1px; background:rgba(226,232,240,0.28);"></div>
    <div id="applyVoxelFilterStatus" style="color:#cbd5e1;"></div>
  `,
});

const { viewport, layout, panel } = shell;
const radiusSlider = document.getElementById("applyVoxelRadiusSlider");
const radiusValue = document.getElementById("applyVoxelRadiusValue");
const status = document.getElementById("applyVoxelFilterStatus");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 100);
camera.position.set(0.3, 7.6, 0.3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.setClearColor(0x000000, 0.14);
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableZoom = false;
controls.target.set(0.3, 0.65, 0);
controls.maxPolarAngle = Math.PI * 0.5;
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 1.45));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
keyLight.position.set(4, 6, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.55);
fillLight.position.set(-3, 4, -2);
scene.add(fillLight);

const tileSize = 4.8;
const cellSize = 0.6;
const baseBounds = {
  min: new THREE.Vector3(-0.9, 0.0, -0.9),
  max: new THREE.Vector3(0.9, 1.4, 0.9),
};

const spans = [
  { name: "A", center: new THREE.Vector3(-1.5, 0.9, -0.3), height: 1 },
  { name: "B", center: new THREE.Vector3(-0.9, 0.8, 0.3), height: 0.6 },
  { name: "C", center: new THREE.Vector3(0.3, 0.5, -0.3), height: 0.4 },
  { name: "D", center: new THREE.Vector3(1.5, 0.6, 0.3), height: 0.2 },
  { name: "E", center: new THREE.Vector3(2.1, 0.35, -0.3), height: 0.7 },
];

const tileGrid = new THREE.GridHelper(tileSize, tileSize / cellSize, 0x6b7280, 0x94a3b8);
scene.add(tileGrid);

const tileSurface = new THREE.Mesh(
  new THREE.PlaneGeometry(tileSize, tileSize),
  new THREE.MeshPhongMaterial({
    color: 0x0f172a,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
  })
);
tileSurface.rotation.x = -Math.PI * 0.5;
scene.add(tileSurface);

const tileOutline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(tileSize, 0.02, tileSize)),
  new THREE.LineBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.85 })
);
tileOutline.position.y = 0.01;
scene.add(tileOutline);

function createBoundsGroup(fillColor, fillOpacity, edgeColor, edgeOpacity) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const fill = new THREE.Mesh(
    geometry,
    new THREE.MeshPhongMaterial({
      color: fillColor,
      transparent: true,
      opacity: fillOpacity,
      depthWrite: false,
    })
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: edgeOpacity })
  );
  const group = new THREE.Group();
  group.add(fill);
  group.add(edges);
  return group;
}

const baseBoundsGroup = createBoundsGroup(0x2563eb, 0.08, 0x60a5fa, 0.95);
const expandedBoundsGroup = createBoundsGroup(0x16a34a, 0.16, 0x22c55e, 0.95);
scene.add(baseBoundsGroup);
scene.add(expandedBoundsGroup);

function createTextSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 48;
  const context = canvas.getContext("2d");

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(15, 23, 42, 0.85)";
  context.strokeStyle = "rgba(226, 232, 240, 0.55)";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 12);
  context.fill();
  context.stroke();

  context.fillStyle = "#f8fafc";
  context.font = "bold 22px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width * 0.5, canvas.height * 0.5);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.55, 0.275, 1);
  return sprite;
}

const spanMeshes = spans.map((span) => {
  const geometry = new THREE.BoxGeometry(cellSize * 0.9, span.height, cellSize * 0.9);
  const material = new THREE.MeshPhongMaterial({
    color: 0x6b7280,
    transparent: true,
    opacity: 0.82,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(span.center);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xe5e7eb, transparent: true, opacity: 0.95 })
  );
  edges.position.copy(span.center);

  const label = createTextSprite(span.name);
  label.position.set(span.center.x, span.center.y + span.height * 0.5 + 0.28, span.center.z);

  scene.add(mesh);
  scene.add(edges);
  scene.add(label);

  return { ...span, mesh, edges, label };
});

function setBoundsTransform(group, bounds) {
  const size = new THREE.Vector3().subVectors(bounds.max, bounds.min);
  const center = new THREE.Vector3().addVectors(bounds.min, bounds.max).multiplyScalar(0.5);
  group.position.copy(center);
  group.scale.copy(size);
}

function pointInsideBounds(point, bounds) {
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y &&
    point.z >= bounds.min.z &&
    point.z <= bounds.max.z
  );
}

function getExpandedBounds(expandBy) {
  return {
    min: baseBounds.min.clone().addScalar(-expandBy),
    max: baseBounds.max.clone().addScalar(expandBy),
  };
}

function getSpanCorners(span) {
  const halfExtent = cellSize * 0.5;
  const minCorner = new THREE.Vector3(
    span.center.x - halfExtent,
    span.center.y - span.height * 0.5,
    span.center.z - halfExtent
  );
  const maxCorner = new THREE.Vector3(
    span.center.x + halfExtent,
    span.center.y + span.height * 0.5,
    span.center.z + halfExtent
  );
  return { minCorner, maxCorner };
}

function updateScene() {
  const walkableRadius = parseFloat(radiusSlider.value);
  const expandBy = walkableRadius * cellSize;
  const expandedBounds = getExpandedBounds(expandBy);
  radiusValue.textContent = walkableRadius.toFixed(1);

  setBoundsTransform(baseBoundsGroup, baseBounds);
  setBoundsTransform(expandedBoundsGroup, expandedBounds);

  const kept = [];
  const removed = [];

  spanMeshes.forEach((span) => {
    const { minCorner, maxCorner } = getSpanCorners(span);
    const survives =
      pointInsideBounds(minCorner, expandedBounds) ||
      pointInsideBounds(maxCorner, expandedBounds);

    if (survives) {
      span.mesh.material.color.setHex(0x22c55e);
      span.edges.material.color.setHex(0x14532d);
      kept.push(span.name);
    } else {
      span.mesh.material.color.setHex(0xef4444);
      span.edges.material.color.setHex(0x7f1d1d);
      removed.push(span.name);
    }
  });

  status.innerHTML =
    `蓝框为生成盒子，绿框为扩张后边界。` +
    `<br>ExpandBy = ${expandBy.toFixed(2)}<br>保留 Span：${kept.join(", ")}<br>剔除 Span：${removed.join(", ")}`;
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

radiusSlider.addEventListener("input", updateScene);

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

window.addEventListener("resize", onResize);

updateScene();
onResize();
animate();
