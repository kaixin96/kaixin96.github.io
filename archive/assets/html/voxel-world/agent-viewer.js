import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/OrbitControls.js';

const container = document.getElementById('scene');
const skinUrl = container.dataset.skinUrl;
const skinUrls = container.dataset.skins ? JSON.parse(container.dataset.skins) : null;
const fallbackAgent = container.dataset.agent || (skinUrls ? Object.keys(skinUrls)[0] : 'agent');
const worldMode = container.dataset.world || 'none';
const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();
let agent = null;
let loadVersion = 0;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(worldMode === 'simple' ? 42 : 38, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(worldMode === 'simple' ? 3.6 : 2.45, worldMode === 'simple' ? 2.1 : 1.72, worldMode === 'simple' ? 4.2 : 3.25);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, worldMode === 'simple' ? 0.55 : 0.9, 0);
controls.minDistance = 1.6;
controls.maxDistance = worldMode === 'simple' ? 8 : 6;
controls.maxPolarAngle = Math.PI * 0.53;
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0x87948d, 2.4));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(4, 6, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 16;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbadcd6, 1.2);
fillLight.position.set(-3, 2, -3);
scene.add(fillLight);

const shadowPlane = new THREE.Mesh(
  new THREE.CircleGeometry(worldMode === 'simple' ? 1.5 : 0.86, 48),
  new THREE.ShadowMaterial({ color: 0x223139, opacity: 0.18 })
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = worldMode === 'simple' ? 0.21 : -0.015;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

function makeBlock(x, y, z, color, scale = [1, 1, 1]) {
  const geometry = new THREE.BoxGeometry(scale[0], scale[1], scale[2]);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y + scale[1] / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addSimpleVoxelWorld() {
  const blockSize = 0.34;
  for (let x = -4; x <= 4; x += 1) {
    for (let z = -3; z <= 3; z += 1) {
      const isWater = x >= 2 && z <= -1;
      const color = isWater ? 0x68aebe : ((x + z) % 2 === 0 ? 0x74a660 : 0x679654);
      makeBlock(x * blockSize, -0.14, z * blockSize, color, [blockSize, 0.22, blockSize]);
    }
  }

  makeBlock(-1.7, 0.08, -0.8, 0x8f9694, [blockSize, blockSize, blockSize]);
  makeBlock(-1.36, 0.08, -0.8, 0x8f9694, [blockSize, blockSize, blockSize]);
  makeBlock(-1.7, 0.42, -0.8, 0x7f8788, [blockSize, blockSize, blockSize]);

  makeBlock(1.05, 0.08, 0.82, 0x7a5636, [blockSize * 0.72, blockSize * 1.75, blockSize * 0.72]);
  makeBlock(1.05, 0.64, 0.82, 0x4f8547, [blockSize * 1.75, blockSize, blockSize * 1.75]);
  makeBlock(1.05, 0.98, 0.82, 0x5f944e, [blockSize * 1.35, blockSize, blockSize * 1.35]);

  makeBlock(-0.22, 0.08, 1.12, 0xd7c07b, [blockSize, blockSize, blockSize]);
  makeBlock(0.12, 0.08, 1.12, 0xd7c07b, [blockSize, blockSize, blockSize]);
}

function configureTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function skinUv(rect) {
  const atlasWidth = 64;
  const atlasHeight = 32;
  const [x, y, width, height] = rect;
  const u0 = x / atlasWidth;
  const u1 = (x + width) / atlasWidth;
  const v0 = 1 - (y + height) / atlasHeight;
  const v1 = 1 - y / atlasHeight;
  return [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
}

function createSkinBox(width, height, depth, rects) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const faceSpecs = [
    { name: 'right', normal: [1, 0, 0], corners: [[halfWidth, 0, -halfDepth], [halfWidth, height, -halfDepth], [halfWidth, height, halfDepth], [halfWidth, 0, halfDepth]] },
    { name: 'left', normal: [-1, 0, 0], corners: [[-halfWidth, 0, halfDepth], [-halfWidth, height, halfDepth], [-halfWidth, height, -halfDepth], [-halfWidth, 0, -halfDepth]] },
    { name: 'top', normal: [0, 1, 0], corners: [[-halfWidth, height, halfDepth], [halfWidth, height, halfDepth], [halfWidth, height, -halfDepth], [-halfWidth, height, -halfDepth]] },
    { name: 'bottom', normal: [0, -1, 0], corners: [[-halfWidth, 0, -halfDepth], [halfWidth, 0, -halfDepth], [halfWidth, 0, halfDepth], [-halfWidth, 0, halfDepth]] },
    { name: 'front', normal: [0, 0, 1], corners: [[halfWidth, 0, halfDepth], [halfWidth, height, halfDepth], [-halfWidth, height, halfDepth], [-halfWidth, 0, halfDepth]] },
    { name: 'back', normal: [0, 0, -1], corners: [[-halfWidth, 0, -halfDepth], [-halfWidth, height, -halfDepth], [halfWidth, height, -halfDepth], [halfWidth, 0, -halfDepth]] }
  ];

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let vertexIndex = 0;

  for (const face of faceSpecs) {
    const faceUv = skinUv(rects[face.name]);
    for (let index = 0; index < 4; index += 1) {
      positions.push(...face.corners[index]);
      normals.push(...face.normal);
      uvs.push(...faceUv[index]);
    }
    indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
    vertexIndex += 4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function makeSkinPart(width, height, depth, rects, material, position) {
  const mesh = new THREE.Mesh(createSkinBox(width, height, depth, rects), material);
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makePivotedSkinPart(width, height, depth, rects, material, pivotPosition) {
  const pivot = new THREE.Group();
  pivot.position.copy(pivotPosition);
  const mesh = makeSkinPart(width, height, depth, rects, material, new THREE.Vector3(0, -height, 0));
  pivot.add(mesh);
  return pivot;
}

function makeAgent(texture) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.78, metalness: 0, alphaTest: 0.1 });
  const headRects = {
    top: [8, 0, 8, 8],
    bottom: [16, 0, 8, 8],
    right: [0, 8, 8, 8],
    front: [8, 8, 8, 8],
    left: [16, 8, 8, 8],
    back: [24, 8, 8, 8]
  };
  const bodyRects = {
    top: [20, 16, 8, 4],
    bottom: [28, 16, 8, 4],
    right: [16, 20, 4, 12],
    front: [20, 20, 8, 12],
    left: [28, 20, 4, 12],
    back: [32, 20, 8, 12]
  };
  const armRects = {
    top: [44, 16, 4, 4],
    bottom: [48, 16, 4, 4],
    right: [40, 20, 4, 12],
    front: [44, 20, 4, 12],
    left: [48, 20, 4, 12],
    back: [52, 20, 4, 12]
  };
  const legRects = {
    top: [4, 16, 4, 4],
    bottom: [8, 16, 4, 4],
    right: [0, 20, 4, 12],
    front: [4, 20, 4, 12],
    left: [8, 20, 4, 12],
    back: [12, 20, 4, 12]
  };

  const cellSize = 0.05625;
  const headSize = cellSize * 8;
  const torsoHeight = cellSize * 12;
  const legHeight = cellSize * 12;
  const torsoWidth = cellSize * 8;
  const limbWidth = cellSize * 4;
  const bodyDepth = cellSize * 4;
  const shoulderX = torsoWidth / 2 + limbWidth / 2;
  const legX = limbWidth / 2;
  const headBaseY = legHeight + torsoHeight;

  const body = makeSkinPart(torsoWidth, torsoHeight, bodyDepth, bodyRects, material, new THREE.Vector3(0, legHeight, 0));
  const head = makeSkinPart(headSize, headSize, headSize, headRects, material, new THREE.Vector3(0, headBaseY, 0));
  const leftArm = makePivotedSkinPart(limbWidth, torsoHeight, bodyDepth, armRects, material, new THREE.Vector3(-shoulderX, legHeight + torsoHeight, 0));
  const rightArm = makePivotedSkinPart(limbWidth, torsoHeight, bodyDepth, armRects, material, new THREE.Vector3(shoulderX, legHeight + torsoHeight, 0));
  const leftLeg = makePivotedSkinPart(limbWidth, legHeight, bodyDepth, legRects, material, new THREE.Vector3(-legX, legHeight, 0));
  const rightLeg = makePivotedSkinPart(limbWidth, legHeight, bodyDepth, legRects, material, new THREE.Vector3(legX, legHeight, 0));

  leftArm.rotation.x = 0.18;
  rightArm.rotation.x = -0.18;
  leftLeg.rotation.x = -0.12;
  rightLeg.rotation.x = 0.12;
  group.rotation.y = 0.08;
  group.add(body, head, leftArm, rightArm, leftLeg, rightLeg);
  group.userData.parts = { head, leftArm, rightArm };
  return group;
}

function resize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function skinUrlFor(agentName) {
  return skinUrls ? skinUrls[agentName] : skinUrl;
}

async function loadSkinTexture(url) {
  const resolved = new URL(url, window.location.href).href;
  if (textureCache.has(resolved)) return textureCache.get(resolved);
  const promise = textureLoader.loadAsync(resolved).then(configureTexture);
  textureCache.set(resolved, promise);
  const texture = await promise;
  textureCache.set(resolved, texture);
  return texture;
}

function disposeAgent(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry.dispose();
    child.material.dispose();
  });
}

async function setAgent(agentName) {
  const nextSkinUrl = skinUrlFor(agentName);
  if (!nextSkinUrl) return;
  const version = ++loadVersion;
  const texture = await loadSkinTexture(nextSkinUrl);
  if (version !== loadVersion) return;

  if (agent) {
    scene.remove(agent);
    disposeAgent(agent);
  }

  agent = makeAgent(texture);
  if (worldMode === 'simple') {
    agent.position.set(-0.24, 0.22, 0.06);
    agent.scale.setScalar(0.92);
  }
  scene.add(agent);
  container.dataset.agent = agentName;
}

window.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'vega:set-agent' && typeof data.agent === 'string') {
    setAgent(data.agent);
  }
});

if (worldMode === 'simple') addSimpleVoxelWorld();
await setAgent(fallbackAgent);

window.addEventListener('resize', resize);

const clock = new THREE.Clock();
function animate() {
  const elapsed = clock.getElapsedTime();
  if (agent) {
    agent.rotation.y = 0.08 + Math.sin(elapsed * 0.42) * 0.08;
    agent.userData.parts.head.rotation.y = Math.sin(elapsed * 0.8) * 0.08;
    agent.userData.parts.leftArm.rotation.x = 0.18 + Math.sin(elapsed * 1.6) * 0.06;
    agent.userData.parts.rightArm.rotation.x = -0.18 - Math.sin(elapsed * 1.6) * 0.06;
  }
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
