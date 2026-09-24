// 海面 · 天空与太阳 · 场景入口
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import GUI from 'lil-gui';
import { createWaterNormals } from './waterNormals.js';

const params = {
  // 太阳
  elevation: 2,          // 高度角（度）
  azimuth: 180,          // 方位角（度）
  discVisible: true,     // 太阳光晕
  discSize: 320,
  // 天空
  turbidity: 10,
  rayleigh: 2,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8,
  exposure: 0.5,
  // 海面
  distortionScale: 3.7,
  waterColor: '#0072ff',
  sunColor: '#ffffff',
  normalStrength: 1.5,
  normalTiling: 1.0,
};

// ---------- 渲染器 / 场景 / 相机 ----------
const container = document.getElementById('scene-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = params.exposure;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
camera.position.set(30, 30, 100);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 40;
controls.maxDistance = 2000;
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// ---------- 天空 ----------
const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);

const skyUniforms = sky.material.uniforms;
skyUniforms.turbidity.value = params.turbidity;
skyUniforms.rayleigh.value = params.rayleigh;
skyUniforms.mieCoefficient.value = params.mieCoefficient;
skyUniforms.mieDirectionalG.value = params.mieDirectionalG;

// ---------- 海面 ----------
let waterNormals = createWaterNormals({ strength: params.normalStrength });
const sunDirection = new THREE.Vector3();

const water = new Water(new THREE.PlaneGeometry(10000, 10000), {
  textureWidth: 512,
  textureHeight: 512,
  waterNormals,
  sunDirection,
  sunColor: params.sunColor,
  waterColor: params.waterColor,
  distortionScale: params.distortionScale,
  fog: false,
});
water.rotation.x = -Math.PI / 2;
scene.add(water);

const waterUniforms = water.material.uniforms;

// ---------- 太阳光晕 ----------
function createGlowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0.0, 'rgba(255, 255, 252, 1)');
  gradient.addColorStop(0.10, 'rgba(255, 250, 232, 0.95)');
  gradient.addColorStop(0.26, 'rgba(255, 224, 168, 0.42)');
  gradient.addColorStop(0.55, 'rgba(255, 196, 128, 0.12)');
  gradient.addColorStop(1.0, 'rgba(255, 180, 110, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const sunDisc = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createGlowTexture(),
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
);
sunDisc.scale.setScalar(params.discSize);
scene.add(sunDisc);

// ---------- 立方体（观察海面反射用） ----------
const sunLight = new THREE.DirectionalLight(0xfff2e0, 3.0);
scene.add(sunLight);
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x123a52, 1.2));

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(12, 12, 12),
  new THREE.MeshStandardMaterial({ color: 0xff7a3c, roughness: 0.4, metalness: 0.05 })
);
cube.position.set(0, 14, 15);
scene.add(cube);

// ---------- 太阳方向同步 ----------
const sun = new THREE.Vector3();

function updateSun() {
  const phi = THREE.MathUtils.degToRad(90 - params.elevation);
  const theta = THREE.MathUtils.degToRad(params.azimuth);
  sun.setFromSphericalCoords(1, phi, theta);

  skyUniforms.sunPosition.value.copy(sun);
  sunDirection.copy(sun).normalize();
  sunDisc.position.copy(sun).multiplyScalar(4000);
  sunLight.position.copy(sun).multiplyScalar(500);
}

// ---------- 控制面板 ----------
const gui = new GUI({ title: '海面 · 天空与太阳' });

const fSun = gui.addFolder('太阳');
fSun.add(params, 'elevation', -5, 85, 0.1).name('高度角(°)').onChange(updateSun);
fSun.add(params, 'azimuth', -180, 180, 1).name('方位角(°)').onChange(updateSun);
fSun.add(params, 'discVisible').name('光晕显示').onChange((v) => (sunDisc.visible = v));
fSun.add(params, 'discSize', 50, 1200, 10).name('光晕大小').onChange((v) => sunDisc.scale.setScalar(v));

const fSky = gui.addFolder('天空');
fSky.add(params, 'turbidity', 1, 20, 0.1).name('浑浊度').onChange((v) => (skyUniforms.turbidity.value = v));
fSky.add(params, 'rayleigh', 0, 4, 0.001).name('瑞利散射').onChange((v) => (skyUniforms.rayleigh.value = v));
fSky.add(params, 'mieCoefficient', 0, 0.1, 0.0005).name('米氏系数').onChange((v) => (skyUniforms.mieCoefficient.value = v));
fSky.add(params, 'mieDirectionalG', 0, 1, 0.01).name('米氏方向').onChange((v) => (skyUniforms.mieDirectionalG.value = v));
fSky.add(params, 'exposure', 0, 2, 0.01).name('曝光').onChange((v) => (renderer.toneMappingExposure = v));

const fWater = gui.addFolder('海面');
fWater.add(params, 'distortionScale', 0, 20, 0.1).name('波纹扭曲').onChange((v) => (waterUniforms.distortionScale.value = v));
fWater.addColor(params, 'waterColor').name('水色').onChange((v) => waterUniforms.waterColor.value.set(v));
fWater.addColor(params, 'sunColor').name('日光色').onChange((v) => waterUniforms.sunColor.value.set(v));
fWater.add(params, 'normalTiling', 0.2, 4, 0.05).name('波纹密度').onChange((v) => (waterUniforms.size.value = v));
fWater.add(params, 'normalStrength', 0, 5, 0.05).name('法线强度').onFinishChange((v) => {
  const next = createWaterNormals({ strength: v });
  waterUniforms.normalSampler.value = next;
  waterNormals.dispose();
  waterNormals = next;
});

// ---------- 主循环 ----------
updateSun();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  waterUniforms.time.value += dt * 0.5;
  controls.update();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
