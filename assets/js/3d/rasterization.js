import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { hatchVSStr, hatchFSStr} from './shader/hatch_shader.js';

const gridHeight = -1.0; // Height of the grid in the scene

const container = document.getElementById('threeBox');
let [tileSize, cellSize] = GetSettingValues(); // Get initial values from sliders

// Scene, Camera, Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio); 
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setClearColor(0xaaaaaa, 0.25); // Transparent background
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false; // Optional: disable zoom
controls.enablePan = false;  // Optional: disable panning
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: null,         // disable scroll/middle
  RIGHT: null // only allow right click to rotate
};

// Define points for inner triangle (filled)
const innerSize = 1;
const thickness = 0.05 * innerSize; // Thickness of the triangle

const getTrianglePoints = (size, zoffset) => [
    new THREE.Vector3(0, size, zoffset),
    new THREE.Vector3(-size, -size, zoffset),
    new THREE.Vector3(size, -size, zoffset),
    new THREE.Vector3(0, size, -zoffset),
    new THREE.Vector3(-size, -size, -zoffset),
    new THREE.Vector3(size, -size, -zoffset),
];

// Inner triangle (fill)
const innerGeometry = new THREE.BufferGeometry().setFromPoints(getTrianglePoints(innerSize, thickness));
innerGeometry.setIndex([0, 1, 2, 3, 5, 4, 0, 3, 1, 3, 4, 1, 0, 2, 3, 3, 2, 5, 1, 4, 2, 4, 5, 2]); // define triangle
innerGeometry.computeVertexNormals();

const fillMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x00ccff,
    metalness: 0.5,
    roughness: 0.5,
    emissive: 0x000000,
    side: THREE.DoubleSide 
});
const innerTriangle = new THREE.Mesh(innerGeometry, fillMaterial);
innerTriangle.rotation.set(-Math.PI * 0.4, 0, 0);
innerTriangle.updateMatrixWorld(true);
scene.add(innerTriangle);

// projection Grid for scene
// Add GridHelper to the scene
let gridSize = tileSize;
const gridCellSize = cellSize;
let gridDivisions = Math.floor(gridSize / gridCellSize);
let gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x888888);
gridHelper.position.y = gridHeight;
gridHelper.updateMatrixWorld(true);
scene.add(gridHelper);

window.GeometryData = {
    bufferData : innerTriangle.geometry.attributes.position.clone().applyMatrix4(innerTriangle.matrixWorld),
    gridData : {
        gridSize : gridSize,
        gridDivisions : gridDivisions,
        gridHeight : gridHeight
    }
};

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
const light2 = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 0);
light2.position.set(-2, -2, -5);
light2.intensity = 0.5; // Dimmer light
scene.add(light);
scene.add(light2);

addProjectionLines(innerTriangle, gridHelper.position.y);

camera.position.z = 4;

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

// Handle resizing the container
window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});


function addProjectionLines(triangleMesh, gridY = -0.5) {
    const geometry = triangleMesh.geometry;
    const position = geometry.attributes.position;
    const worldMatrix = triangleMesh.matrixWorld;

    let projectPoints = [];

    for(let i = 0; i < position.count / 2; i++) {
        const localPos = new THREE.Vector3().fromBufferAttribute(position, i);
        const worldPos = localPos.clone().applyMatrix4(worldMatrix);
        
        const projectedPos = worldPos.clone();
        projectedPos.y = gridY - 0.01;

        const lineGeometry = new THREE.BufferGeometry().setFromPoints([worldPos, projectedPos]);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x999999 });

        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.thickness = 2;
        scene.add(line);

        projectPoints.push(projectedPos);
    }

    const projectTriGeometry = new THREE.BufferGeometry().setFromPoints(projectPoints);
    projectTriGeometry.setIndex([0, 1, 2]);
    const hatchMaterial = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: new THREE.Color(0xff0000) },
          scale: { value: 10.0 },       // line density
          lineWidth: { value: 0.3 },   // thickness
          angle: { value: Math.PI / 4 } // 45 degrees
        },
        vertexShader:   hatchVSStr,
        fragmentShader: hatchFSStr,
        transparent: true,
        side: THREE.DoubleSide
      });
    const projectTriMaterial = new THREE.MeshBasicMaterial({ color: 0x00ccff, side: THREE.DoubleSide });
    const projectTriangle = new THREE.Mesh(projectTriGeometry, hatchMaterial);
    scene.add(projectTriangle);
}

function GetSettingValues(){
    const tileSlider = document.getElementById("tileSizeSlider");
    const cellSlider = document.getElementById("cellSizeSlider");

    const tileSize = parseFloat(tileSlider.value);
    const cellSize = parseFloat(cellSlider.value);

    tileSlider.addEventListener('input', ()=> {
        var tileSize = parseFloat(tileSlider.value);
        var cellSize = parseFloat(cellSlider.value);
        ReComputeGridSize(tileSize, cellSize);
    });

    cellSlider.addEventListener('input', ()=> {
        var tileSize = parseFloat(tileSlider.value);
        var cellSize = parseFloat(cellSlider.value);
        ReComputeGridSize(tileSize, cellSize);
    });

    return [tileSize, cellSize];
}

function ReComputeGridSize(tileSize, cellSize) {
    scene.remove(gridHelper);
    gridDivisions = Math.floor(tileSize / cellSize)
    gridHelper = new THREE.GridHelper(tileSize, gridDivisions, 0x444444, 0x888888);
    gridHelper.position.y = gridHeight;
    scene.add(gridHelper);
}