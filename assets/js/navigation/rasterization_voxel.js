import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { spanGrids } from "./span.js";

const geomBufferData = window.GeometryData?.bufferData || [];

const gridData = window.GeometryData?.gridData || [];
let gridSize = gridData.gridSize, gridDivisions = gridData.gridDivisions;
const gridHeight = gridData.gridHeight;
const realCellSize = gridSize / gridDivisions;
const bmin = -gridSize / 2, bmax = gridSize / 2;

const spans = new spanGrids(gridDivisions);

const $container = $('#rasterize_voxel')
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, $container.width() / $container.height(), 0.1, 1000);
camera.position.z = 4;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize($container.width(), $container.height());
renderer.setClearColor(0x000000, 0.25); // Transparent background
$container.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false; // Optional: disable zoom
controls.enablePan = false;  // Optional: disable panning
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: null,         // disable scroll/middle
  RIGHT: null // only allow right click to rotate
};


RasterizeTriangle(geomBufferData);
drawBoxUsingSpanData();

let gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x888888);
gridHelper.position.y = gridHeight;
gridHelper.updateMatrixWorld(true);
scene.add(gridHelper);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5).normalize();
scene.add(light);

// if (geomBufferData == null) {
//     console.log("bufferData is null, please check the data source.");
// }
// else {
//     console.log("ths buffer dat is:" + geomBufferData);
//     for(let i = 0; i < geomBufferData.count; i++){
//         const pos = new THREE.Vector3().fromBufferAttribute(geomBufferData, i);
//         console.log(`the buffer data is:${pos.x}, ${pos.y}, ${pos.z}`);
//     }
// }

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

// Handle resizing the container
window.addEventListener('resize', () => {
    const w = $container.width();
    const h = $container.height();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});

const $tileSlider = $("#tileSizeSlider");
const $cellSlider = $("#cellSizeSlider");
$tileSlider.on('input', ()=> {
    let tileSize = parseFloat($tileSlider.val());
    let cellSize = parseFloat($cellSlider.val());
    ReComputeGridSize(tileSize, cellSize);
});

$cellSlider.on('input', ()=> {
    let tileSize = parseFloat($tileSlider.val());
    let cellSize = parseFloat($cellSlider.val());
    ReComputeGridSize(tileSize, cellSize);
});

function drawBoxUsingSpanData()
{
    const boxGeometry = new THREE.BoxGeometry(realCellSize, realCellSize, realCellSize);
    const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x5566dd, wireframe: true });
    const spanscount = spans.size * spans.size;
    for(let i = 0; i < spanscount; i++)
    {
        const span = spans.spans[i];
        if(span !== null)
        {
            let currentSpan = span;
            while(currentSpan !== null)
            {
                const xIndex = Math.floor(i % spans.size);
                const zIndex = Math.floor(i / spans.size);
                const yMin = currentSpan.minH;
                const yMax = currentSpan.maxH;

                const xpos = xIndex * realCellSize + realCellSize / 2 + bmin;
                const zpos = zIndex * realCellSize + realCellSize / 2 + bmin;

                const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
                boxMesh.position.set(xpos, (yMin + yMax) / 2, zpos);
                scene.add(boxMesh.clone());

                currentSpan = currentSpan.getNext();
            }
        }
    }
}

function RasterizeTriangle(tiranglePos)
{
    for(let i = 0; i < tiranglePos.count / 2; i++)
    {
        const pos = new THREE.Vector3().fromBufferAttribute(tiranglePos, i);
        let xIndex = Math.floor((pos.x - bmin) / realCellSize);
        let zIndex = Math.floor((pos.z - bmin) / realCellSize);

        spans.addSpan(xIndex, zIndex, pos.y, pos.y);
    }
}

function ReComputeGridSize(tileSize, cellSize) {
    scene.remove(gridHelper);
    gridDivisions = Math.floor(tileSize / cellSize)
    gridHelper = new THREE.GridHelper(tileSize, gridDivisions, 0x444444, 0x888888);
    gridHelper.position.y = gridHeight;
    scene.add(gridHelper);
}