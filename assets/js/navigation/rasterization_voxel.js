import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { createDemoShell, applyResponsiveSplitLayout } from './demo_split_layout.js';

const $container = $("#rasterize_voxel");

if (!$container.length) {
  throw new Error("Missing rasterize_voxel container.");
}

const shell = createDemoShell($container[0], {
  layoutId: "rasterizeVoxelLayout",
  viewportId: "rasterizeVoxelViewport",
  panelId: "rasterizeVoxelPanel",
  title: "三角面体素化",
  headerRight: "参数面板",
  viewportHeight: 340,
  maxWidth: "760px",
  viewportOverlayHtml: `
    <div
      style="
        position:absolute;
        left:12px;
        top:12px;
        padding:6px 10px;
        border-radius:999px;
        background:rgba(15,23,42,0.72);
        color:#f8fafc;
        font-size:12px;
        line-height:1;
        pointer-events:none;
        box-shadow:0 4px 12px rgba(0,0,0,0.18);
        z-index:2;
        white-space:nowrap;
      "
    >可拖拽顶点</div>
  `,
  panelBodyHtml: `
    <label style="display:block; margin-bottom:10px;">
      <span style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; font-size:12px; font-weight:350;">
        <span>Tile Size</span>
        <span id="tileSizeValue">7</span>
      </span>
      <input id="tileSizeSlider" type="range" min="4" max="10" step="1" value="7" style="display:block; width:100%; appearance:auto; -webkit-appearance:auto; accent-color:#60a5fa;">
    </label>
    <label style="display:block; margin-bottom:10px;">
      <span style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; font-size:12px; font-weight:350;">
        <span>Cell Size</span>
        <span id="cellSizeValue">0.6</span>
      </span>
      <input id="cellSizeSlider" type="range" min="0.1" max="1" step="0.1" value="0.6" style="display:block; width:100%; appearance:auto; -webkit-appearance:auto; accent-color:#60a5fa;">
    </label>
    <label style="display:block;">
      <span style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; font-size:12px; font-weight:350;">
        <span>Cell Height</span>
        <span id="cellHeightValue">0.5</span>
      </span>
      <input id="cellHeightSlider" type="range" min="0.05" max="1" step="0.05" value="0.5" style="display:block; width:100%; appearance:auto; -webkit-appearance:auto; accent-color:#60a5fa;">
    </label>
    <div style="margin:12px 0 10px; height:1px; background:rgba(226,232,240,0.28);"></div>
    <div id="controls" style="color:#cbd5e1;"></div>
  `,
});

const $viewport = $(shell.viewport);
const $layout = $(shell.layout);
const $panel = $(shell.panel);
const $tileSlider = $("#tileSizeSlider");
const $cellSlider = $("#cellSizeSlider");
const $cellHeightSlider = $("#cellHeightSlider");
const $tileValue = $("#tileSizeValue");
const $cellValue = $("#cellSizeValue");
const $cellHeightValue = $("#cellHeightValue");
const $controls = $("#controls");

let gridSize = parseFloat($tileSlider.val() || "7");
let gridDivisions = Math.max(1, Math.floor(gridSize / parseFloat($cellSlider.val() || "0.6")));
const gridHeight = -1.0;
let realCellSize = gridSize / gridDivisions;
let bmin = -gridSize / 2;
let bmax = gridSize / 2;
let cellHeight = parseFloat($cellHeightSlider.val() || "0.05");

const vertexColors = [0xef4444, 0x22c55e, 0x3b82f6];
const vertexNames = ["顶点 A", "顶点 B", "顶点 C"];
const highlightColor = 0xfacc15;
const vertexMarkerRadius = 0.12;
const defaultVertexPositions = [
  new THREE.Vector3(0.0, 0.95, -1.1),
  new THREE.Vector3(-1.2, 0.15, 0.7),
  new THREE.Vector3(1.2, 0.15, 0.7),
];

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, $viewport.width() / $viewport.height(), 0.1, 1000);
camera.position.set(0.5, 1.9, 5.6);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize($viewport.width(), $viewport.height());
renderer.setClearColor(0x000000, 0.08);
$viewport.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.target.set(0, gridHeight + 0.5, 0);
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: null,
  RIGHT: null,
};

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const light = new THREE.DirectionalLight(0xffffff, 1.05);
light.position.set(5, 6, 4).normalize();
scene.add(light);

let gridHelper = null;
const demoGroup = new THREE.Group();
scene.add(demoGroup);

const tempVec = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const dragHitPoint = new THREE.Vector3();
const dragOffset = new THREE.Vector3();
const dragPlaneNormal = new THREE.Vector3();
let vertexEntries = [];
let vertexPositions = [];
let activeVertexIndex = -1;
let isDraggingVertex = false;
let draggedVertexIndex = -1;
let activePointerId = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateGridBounds() {
  realCellSize = gridSize / gridDivisions;
  bmin = -gridSize / 2;
  bmax = gridSize / 2;
}

function updateGridHelper() {
  if (gridHelper) {
    scene.remove(gridHelper);
  }
  gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x888888);
  gridHelper.position.y = gridHeight;
  gridHelper.updateMatrixWorld(true);
  scene.add(gridHelper);
}

function extractTriangleVertices() {
  if (vertexPositions.length) {
    return vertexPositions.map((position) => position.clone());
  }

  const vertices = defaultVertexPositions.map((position) => position.clone());
  vertexPositions = vertices.map((position) => position.clone());
  return vertices;
}

function buildVertexEntries() {
  const vertices = extractTriangleVertices();
  vertexEntries = vertices.map((position, index) => {
    const xIndex = clamp(Math.floor((position.x - bmin) / realCellSize), 0, gridDivisions - 1);
    const zIndex = clamp(Math.floor((position.z - bmin) / realCellSize), 0, gridDivisions - 1);
    const yIndex = Math.max(0, Math.floor((position.y - gridHeight) / cellHeight));
    const cellMinX = bmin + xIndex * realCellSize;
    const cellMaxX = cellMinX + realCellSize;
    const cellMinZ = bmin + zIndex * realCellSize;
    const cellMaxZ = cellMinZ + realCellSize;
    const spanMinY = gridHeight + yIndex * cellHeight;
    const spanMaxY = spanMinY + cellHeight;
    return {
      index,
      name: vertexNames[index] || `顶点 ${index + 1}`,
      color: vertexColors[index % vertexColors.length],
      position,
      xIndex,
      zIndex,
      yIndex,
      cellMinX,
      cellMaxX,
      cellMinZ,
      cellMaxZ,
      spanMinY,
      spanMaxY,
      objects: {},
    };
  });
}

function clearDemoGroup() {
  while (demoGroup.children.length) {
    const child = demoGroup.children[0];
    demoGroup.remove(child);
    if (child.geometry) {
      child.geometry.dispose();
    }
    child.children.forEach((nestedChild) => {
      if (nestedChild.geometry) {
        nestedChild.geometry.dispose();
      }
      if (Array.isArray(nestedChild.material)) {
        nestedChild.material.forEach((material) => material.dispose());
      } else if (nestedChild.material) {
        nestedChild.material.dispose();
      }
    });
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else if (child.material) {
      child.material.dispose();
    }
  }
}

function createLine(points, color, opacity = 0.8) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geometry, material);
}

function createFootprint(entry) {
  const geometry = new THREE.PlaneGeometry(realCellSize * 0.94, realCellSize * 0.94);
  const material = new THREE.MeshBasicMaterial({
    color: entry.color,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
  });
  const footprint = new THREE.Mesh(geometry, material);
  footprint.rotation.x = -Math.PI * 0.5;
  footprint.position.set(
    (entry.cellMinX + entry.cellMaxX) * 0.5,
    gridHeight + 0.01,
    (entry.cellMinZ + entry.cellMaxZ) * 0.5
  );
  return footprint;
}

function createSpanBox(entry) {
  const height = Math.max(entry.spanMaxY - entry.spanMinY, cellHeight);
  const geometry = new THREE.BoxGeometry(realCellSize * 0.94, height, realCellSize * 0.94);
  const material = new THREE.MeshStandardMaterial({
    color: entry.color,
    transparent: true,
    opacity: 0.48,
    roughness: 0.55,
    metalness: 0.1,
  });
  const box = new THREE.Mesh(geometry, material);
  box.position.set(
    (entry.cellMinX + entry.cellMaxX) * 0.5,
    entry.spanMinY + height * 0.5,
    (entry.cellMinZ + entry.cellMaxZ) * 0.5
  );

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: entry.color, transparent: true, opacity: 0.95 })
  );
  box.add(edges);
  return box;
}

function createLowerSpanGuides(entry) {
  const group = new THREE.Group();
  for (let level = 0; level < entry.yIndex; level += 1) {
    const geometry = new THREE.BoxGeometry(realCellSize * 0.94, cellHeight * 0.9, realCellSize * 0.94);
    const material = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.08,
    });
    const box = new THREE.Mesh(geometry, material);
    box.position.set(
      (entry.cellMinX + entry.cellMaxX) * 0.5,
      gridHeight + (level + 0.5) * cellHeight,
      (entry.cellMinZ + entry.cellMaxZ) * 0.5
    );

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: entry.color, transparent: true, opacity: 0.28 })
    );
    box.add(edges);
    group.add(box);
  }
  return group;
}

function createColumnGuide(entry) {
  const points = [
    new THREE.Vector3(entry.position.x, entry.position.y, entry.position.z),
    new THREE.Vector3(entry.position.x, gridHeight, entry.position.z),
  ];
  return createLine(points, entry.color, 0.7);
}

function createCellFrame(entry) {
  const corners = [
    new THREE.Vector3(entry.cellMinX, gridHeight + 0.015, entry.cellMinZ),
    new THREE.Vector3(entry.cellMaxX, gridHeight + 0.015, entry.cellMinZ),
    new THREE.Vector3(entry.cellMaxX, gridHeight + 0.015, entry.cellMaxZ),
    new THREE.Vector3(entry.cellMinX, gridHeight + 0.015, entry.cellMaxZ),
    new THREE.Vector3(entry.cellMinX, gridHeight + 0.015, entry.cellMinZ),
  ];
  return createLine(corners, entry.color, 0.9);
}

function createVertexMarker(entry) {
  const geometry = new THREE.SphereGeometry(vertexMarkerRadius, 18, 18);
  const material = new THREE.MeshStandardMaterial({
    color: entry.color,
    emissive: 0x000000,
    roughness: 0.35,
    metalness: 0.15,
  });
  const marker = new THREE.Mesh(geometry, material);
  marker.position.copy(entry.position);
  return marker;
}

function createTriangleOutline() {
  if (vertexEntries.length < 3) {
    return null;
  }

  return createLine(
    [
      vertexEntries[0].position,
      vertexEntries[1].position,
      vertexEntries[2].position,
      vertexEntries[0].position,
    ],
    0x1f2937,
    0.75
  );
}

function createTriangleFace() {
  if (vertexEntries.length < 3) {
    return null;
  }

  const positions = new Float32Array([
    vertexEntries[0].position.x, vertexEntries[0].position.y, vertexEntries[0].position.z,
    vertexEntries[1].position.x, vertexEntries[1].position.y, vertexEntries[1].position.z,
    vertexEntries[2].position.x, vertexEntries[2].position.y, vertexEntries[2].position.z,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      roughness: 0.65,
      metalness: 0.05,
    })
  );
}

function renderLegend() {
  $tileValue.text(gridSize.toFixed(0));
  $cellValue.text(realCellSize.toFixed(2));
  $cellHeightValue.text(cellHeight.toFixed(2));

  if (!vertexEntries.length || activeVertexIndex < 0) {
    $controls.html(`当前拖拽任一顶点，可查看其落入的体素列与高度层。`);
    return;
  }

  const entry = vertexEntries.find((item) => item.index === activeVertexIndex);
  if (!entry) {
    $controls.html(`当前拖拽任一顶点，可查看其落入的体素列与高度层。`);
    return;
  }

  $controls.html(`
    <div><strong style="color:#f8fafc;">${entry.name}</strong></div>
    <div>Grid = ${gridDivisions} × ${gridDivisions}，实际 Cell Size = ${realCellSize.toFixed(2)}</div>
    <div>Cell Index = (${entry.xIndex}, ${entry.zIndex})，Height Layer = ${entry.yIndex}</div>
    <div>Vertex = (${entry.position.x.toFixed(2)}, ${entry.position.y.toFixed(2)}, ${entry.position.z.toFixed(2)})</div>
  `);
}

function setBoxOpacity(box, fillOpacity, edgeOpacity) {
  box.material.opacity = fillOpacity;
  if (box.children[0] && box.children[0].material) {
    box.children[0].material.opacity = edgeOpacity;
  }
}

function updateActiveVertex(index) {
  if (!vertexEntries.length || activeVertexIndex === index) {
    return;
  }

  activeVertexIndex = index;
  vertexEntries.forEach((entry) => {
    const isActive = entry.index === index;
    const markerMaterial = entry.objects.marker.material;
    markerMaterial.emissive.setHex(isActive ? highlightColor : 0x000000);

    entry.objects.line.material.opacity = isActive ? 1.0 : 0.35;
    entry.objects.frame.material.opacity = isActive ? 1.0 : 0.4;
    entry.objects.footprint.material.opacity = isActive ? 0.42 : 0.12;
    setBoxOpacity(entry.objects.box, isActive ? 0.72 : 0.28, isActive ? 1.0 : 0.55);
    entry.objects.lowerGuides.children.forEach((guideBox) => {
      setBoxOpacity(guideBox, isActive ? 0.14 : 0.05, isActive ? 0.48 : 0.18);
    });
  });

  renderLegend();
}

function rebuildDemo() {
  buildVertexEntries();
  clearDemoGroup();

  const triangleFace = createTriangleFace();
  const triangleOutline = createTriangleOutline();
  if (triangleFace) {
    demoGroup.add(triangleFace);
  }
  if (triangleOutline) {
    demoGroup.add(triangleOutline);
  }

  vertexEntries.forEach((entry) => {
    const marker = createVertexMarker(entry);
    const line = createColumnGuide(entry);
    const frame = createCellFrame(entry);
    const footprint = createFootprint(entry);
    const box = createSpanBox(entry);
    const lowerGuides = createLowerSpanGuides(entry);

    entry.objects = { marker, line, frame, footprint, box, lowerGuides };
    demoGroup.add(marker, line, frame, footprint, box, lowerGuides);
  });

  activeVertexIndex = -1;
  if (vertexEntries.length) {
    updateActiveVertex(0);
  } else {
    renderLegend();
  }
}

function reconfigureGrid(tileSize, cellSizeValue) {
  gridSize = tileSize;
  gridDivisions = Math.max(1, Math.floor(tileSize / cellSizeValue));
  updateGridBounds();
  updateGridHelper();
  rebuildDemo();
}

function onResize() {
  applyResponsiveSplitLayout($container[0], $layout[0], $viewport[0], $panel[0], {
    breakpoint: 700,
    wideViewportFlex: "1 1 0%",
    widePanelFlex: "1 1 0%",
    widePanelWidth: "auto",
    stackedViewportFlex: "1 1 300px",
    stackedPanelFlex: "1 1 240px",
  });

  const w = $viewport.width();
  const h = $viewport.height();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function setPointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickVertexMarker(event) {
  if (!vertexEntries.length) {
    return null;
  }

  setPointerFromEvent(event);
  raycaster.setFromCamera(pointerNdc, camera);
  const intersections = raycaster.intersectObjects(
    vertexEntries.map((entry) => entry.objects.marker),
    false
  );
  if (!intersections.length) {
    return null;
  }

  const marker = intersections[0].object;
  return vertexEntries.find((entry) => entry.objects.marker === marker) || null;
}

function onPointerDown(event) {
  const pickedEntry = pickVertexMarker(event);
  if (!pickedEntry) {
    return;
  }

  event.preventDefault();
  activePointerId = event.pointerId;
  draggedVertexIndex = pickedEntry.index;
  isDraggingVertex = true;
  updateActiveVertex(draggedVertexIndex);
  controls.enabled = false;

  setPointerFromEvent(event);
  raycaster.setFromCamera(pointerNdc, camera);
  camera.getWorldDirection(dragPlaneNormal).normalize();
  dragPlane.setFromNormalAndCoplanarPoint(dragPlaneNormal, pickedEntry.position);
  if (raycaster.ray.intersectPlane(dragPlane, dragHitPoint)) {
    dragOffset.copy(pickedEntry.position).sub(dragHitPoint);
  } else {
    dragOffset.set(0, 0, 0);
  }

  renderer.domElement.style.cursor = "grabbing";
  renderer.domElement.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (!isDraggingVertex || draggedVertexIndex < 0 || event.pointerId !== activePointerId) {
    const hoveredEntry = pickVertexMarker(event);
    renderer.domElement.style.cursor = hoveredEntry ? "grab" : "default";
    return;
  }

  setPointerFromEvent(event);
  raycaster.setFromCamera(pointerNdc, camera);
  if (!raycaster.ray.intersectPlane(dragPlane, dragHitPoint)) {
    return;
  }

  vertexPositions[draggedVertexIndex].copy(dragHitPoint).add(dragOffset);
  vertexPositions[draggedVertexIndex].y = Math.max(gridHeight + vertexMarkerRadius, vertexPositions[draggedVertexIndex].y);
  rebuildDemo();
  updateActiveVertex(draggedVertexIndex);
}

function finishDragging(event) {
  if (!isDraggingVertex || (event && event.pointerId !== activePointerId)) {
    return;
  }

  if (event) {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }
  isDraggingVertex = false;
  draggedVertexIndex = -1;
  activePointerId = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = "default";
}

$tileSlider.on("input", () => {
  reconfigureGrid(parseFloat($tileSlider.val()), parseFloat($cellSlider.val()));
});

$cellSlider.on("input", () => {
  reconfigureGrid(parseFloat($tileSlider.val()), parseFloat($cellSlider.val()));
});

$cellHeightSlider.on("input", () => {
  cellHeight = parseFloat($cellHeightSlider.val());
  rebuildDemo();
});

window.addEventListener("resize", onResize);
renderer.domElement.addEventListener("pointerdown", onPointerDown);
renderer.domElement.addEventListener("pointermove", onPointerMove);
renderer.domElement.addEventListener("pointerup", finishDragging);
renderer.domElement.addEventListener("pointercancel", finishDragging);

updateGridBounds();
updateGridHelper();
rebuildDemo();
onResize();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
