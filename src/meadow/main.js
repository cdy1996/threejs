// 草原木屋 · 场景入口
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';

import { createTerrain, terrainHeight } from './terrain.js';
import { createGrass, createGrassCards, createFlowers } from './grass.js';
import { createCabin } from './cabin.js';
import { createFence } from './fence.js';
import { createNature } from './nature.js';
import { createSky, createClouds, createBirds, createMotes, sunTint } from './sky.js';
import { createPostFX } from './postfx.js';

/* ============================ 质量档位 ============================ */
const QUALITY = {
  low: { blades: 45000, segments: 4, cards: 6000, flowers: 900, pixelRatio: 1.0, label: '低' },
  medium: { blades: 90000, segments: 5, cards: 11000, flowers: 1800, pixelRatio: 1.25, label: '中' },
  high: { blades: 150000, segments: 5, cards: 16000, flowers: 2600, pixelRatio: 1.5, label: '高' },
  ultra: { blades: 240000, segments: 6, cards: 24000, flowers: 3600, pixelRatio: 2.0, label: '极致' },
};

const params = {
  quality: 'high',
  // 草地
  windStrength: 0.42,
  windSpeed: 1.0,
  windDirDeg: 20,
  dryColor: '#c2ab63',
  baseTint: '#ffffff',
  flowers: true,
  // 天空
  sunElevation: 26,
  sunAzimuth: 128,
  sunIntensity: 5.0,
  skyScale: 1.0,
  turbidity: 3.4,
  rayleigh: 1.15,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.82,
  clouds: true,
  birds: true,
  motes: true,
  // 场景
  fogDensity: 0.0125,
  shadows: true,
  smoke: true,
  autoRotate: false,
  // 后期
  exposure: 1.0,
  saturation: 1.06,
  contrast: 1.05,
  vignette: 0.34,
  grain: 0.014,
  chromatic: 0.0016,
  sharpen: 0.22,
  bloomStrength: 0.34,
  bloomRadius: 0.62,
  bloomThreshold: 0.92,
  aa: true,
};

/* ============================ 渲染器 ============================ */
const container = document.getElementById('scene-container');
const statEl = document.getElementById('stat');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[params.quality].pixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color('#bccbd6'), params.fogDensity);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.08, 1200);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 1.0;
controls.maxDistance = 130;
controls.maxPolarAngle = Math.PI * 0.497;
controls.autoRotateSpeed = 0.35;

/* ============================ 天空 / 光照 ============================ */
const sky = createSky({ skyScale: params.skyScale });
scene.add(sky.sky, sky.sun, sky.hemi, sky.ambient);

const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
function rebuildEnv() {
  const envScene = new THREE.Scene();
  envScene.add(sky.sky.clone());
  const rt = pmrem.fromScene(envScene, 0.02, 1, 1e6);
  scene.environment = rt.texture;
  if (envRT) envRT.dispose();
  envRT = rt;
}

function sunDirection() {
  const el = THREE.MathUtils.degToRad(params.sunElevation);
  const az = THREE.MathUtils.degToRad(params.sunAzimuth);
  return new THREE.Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az)
  ).normalize();
}

/* ============================ 场景内容 ============================ */
const terrain = createTerrain();
scene.add(terrain.mesh);

const cabin = createCabin();
scene.add(cabin.group);

const fence = createFence();
scene.add(fence.group);

const nature = createNature();
scene.add(nature.group);

const clouds = createClouds();
scene.add(clouds.group);

const birds = createBirds();
scene.add(birds.mesh);

const motes = createMotes();
scene.add(motes.points);

/* ---- 草地（可随质量档位重建） ---- */
let grass = null, cards = null, flowers = null;

function disposeFoliage() {
  for (const o of [grass, cards, flowers]) {
    if (!o) continue;
    scene.remove(o.mesh);
    o.mesh.geometry.dispose();
    o.mesh.material.dispose();
  }
  grass = cards = flowers = null;
}

function buildFlowers() {
  if (flowers) {
    scene.remove(flowers.mesh);
    flowers.mesh.geometry.dispose();
    flowers.material.dispose();
    flowers = null;
  }
  if (!params.flowers) return;
  flowers = createFlowers({ count: QUALITY[params.quality].flowers, rNear: 26 });
  scene.add(flowers.mesh);
}

function buildFoliage() {
  disposeFoliage();
  const q = QUALITY[params.quality];
  grass = createGrass({ count: q.blades, segments: q.segments, rNear: 30 });
  scene.add(grass.mesh);
  cards = createGrassCards({ count: q.cards, rMin: 23, rMax: 96 });
  scene.add(cards.mesh);
  buildFlowers();
  syncAll();
}

/* ============================ 后处理 ============================ */
const postfx = createPostFX(renderer, scene, camera, {
  width: renderer.domElement.width,
  height: renderer.domElement.height,
});

/* ============================ 统一同步 ============================ */
const sunColorW = new THREE.Color();
const windTmp = new THREE.Vector2();

function syncSun() {
  const dir = sunDirection();
  const u = sky.uniforms;
  u.sunPosition.value.copy(dir);
  u.turbidity.value = params.turbidity;
  u.rayleigh.value = params.rayleigh;
  u.mieCoefficient.value = params.mieCoefficient;
  u.mieDirectionalG.value = params.mieDirectionalG;

  const tint = sunTint(params.sunElevation);
  sky.sun.color.copy(tint);
  sky.sun.intensity = params.sunIntensity;
  sky.sun.position.copy(dir).multiplyScalar(110);
  sky.uniforms.uSkyScale.value = params.skyScale;
  sky.hemi.intensity = 0.34 + 0.36 * THREE.MathUtils.clamp(params.sunElevation / 42, 0, 1);
  sky.hemi.color.copy(new THREE.Color('#b7d2ec')).lerp(tint, 0.32);
  sky.hemi.groundColor.set('#3f4a22');
  sky.ambient.intensity = 0.06 + 0.10 * THREE.MathUtils.clamp(params.sunElevation / 40, 0, 1);

  scene.fog.color.copy(new THREE.Color('#b9c9d6').lerp(tint, 0.30));
  scene.fog.density = params.fogDensity;
  renderer.toneMappingExposure = params.exposure;

  sunColorW.copy(sky.sun.color).multiplyScalar(sky.sun.intensity / Math.PI);
  const a = THREE.MathUtils.degToRad(params.windDirDeg);
  windTmp.set(Math.cos(a), Math.sin(a)).normalize();
}

function syncAll() {
  syncSun();
  const dir = sky.uniforms.sunPosition.value;

  for (const o of [grass, cards, flowers]) {
    if (!o) continue;
    const u = o.uniforms;
    if (u.uWindStrength) u.uWindStrength.value = params.windStrength;
    if (u.uWindSpeed) u.uWindSpeed.value = params.windSpeed;
    if (u.uWindDir) u.uWindDir.value.copy(windTmp);
    if (u.uSunDirW) u.uSunDirW.value.copy(dir);
    if (u.uSunColorW) u.uSunColorW.value.copy(sunColorW);
    if (u.uDryColor) u.uDryColor.value.set(params.dryColor);
    if (u.uBaseTint) u.uBaseTint.value.set(params.baseTint);
  }

  cabin.smoke.uniforms.uWindDir.value.copy(windTmp);
  cabin.smoke.uniforms.uSkyColor.value.copy(scene.fog.color);
  cabin.smoke.points.visible = params.smoke;

  birds.uniforms.uSky.value.copy(scene.fog.color);
  clouds.group.visible = params.clouds;
  birds.mesh.visible = params.birds;
  motes.points.visible = params.motes;
  motes.uniforms.uSunDir.value.copy(dir);

  renderer.shadowMap.enabled = params.shadows;
  sky.sun.castShadow = params.shadows;

  Object.assign(postfx.params, {
    saturation: params.saturation,
    contrast: params.contrast,
    vignette: params.vignette,
    grain: params.grain,
    chromatic: params.chromatic,
    sharpen: params.sharpen,
    bloomStrength: params.bloomStrength,
    bloomRadius: params.bloomRadius,
    bloomThreshold: params.bloomThreshold,
    aa: params.aa,
  });
  postfx.sync();

  updateProjectionScale();
}

function updateProjectionScale() {
  const h = renderer.domElement.height;
  const proj = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  motes.uniforms.uProj.value = proj;
  cabin.smoke.uniforms.uProj.value = proj;
}

/* ============================ 控制面板 ============================ */
const gui = new GUI({ title: '草原木屋' });

const fCam = gui.addFolder('相机');
fCam.add(params, 'autoRotate').name('自动环绕').onChange((v) => { controls.autoRotate = v; });
fCam.add({ go: () => { camera.position.set(6.4, 0.9, 7.8); controls.target.set(0.3, 1.2, 0.6); } }, 'go').name('→ 贴地视角');
fCam.add({ go: () => { camera.position.set(27, 12, 32); controls.target.set(0.5, 3.0, 1.0); } }, 'go').name('→ 远景全景');
fCam.add({ go: () => { camera.position.set(2.6, 0.42, 4.6); controls.target.set(2.4, 0.28, 2.2); } }, 'go').name('→ 近看草地');
fCam.add({ go: () => { camera.position.set(1.6, 1.5, 7.2); controls.target.set(0.0, 1.5, 2.2); } }, 'go').name('→ 正对木屋');

const fGrass = gui.addFolder('草地');
fGrass.add(params, 'quality', Object.keys(QUALITY)).name('密度档位')
  .onChange((k) => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[k].pixelRatio));
    onResize();
    buildFoliage();
  });
fGrass.add(params, 'windStrength', 0, 1.4, 0.01).name('风力').onChange(syncAll);
fGrass.add(params, 'windSpeed', 0.1, 3, 0.01).name('风速').onChange(syncAll);
fGrass.add(params, 'windDirDeg', 0, 360, 1).name('风向(°)').onChange(syncAll);
fGrass.addColor(params, 'baseTint').name('草色基调').onChange(syncAll);
fGrass.addColor(params, 'dryColor').name('干枯色').onChange(syncAll);
fGrass.add(params, 'flowers').name('野花').onChange(() => { buildFlowers(); syncAll(); });

const fSky = gui.addFolder('天空与太阳');
fSky.add(params, 'sunElevation', 2, 78, 0.5).name('太阳高度角').onChange(syncAll).onFinishChange(rebuildEnv);
fSky.add(params, 'sunAzimuth', 0, 360, 1).name('太阳方位角').onChange(syncAll).onFinishChange(rebuildEnv);
fSky.add(params, 'sunIntensity', 0.5, 12, 0.1).name('阳光强度').onChange(syncAll);
fSky.add(params, 'skyScale', 0.2, 2.5, 0.01).name('天空亮度').onChange(syncAll);
fSky.add(params, 'turbidity', 0.5, 16, 0.1).name('大气浑浊度').onChange(syncSun).onFinishChange(rebuildEnv);
fSky.add(params, 'rayleigh', 0.1, 4, 0.01).name('瑞利散射').onChange(syncSun).onFinishChange(rebuildEnv);
fSky.add(params, 'mieCoefficient', 0, 0.05, 0.0005).name('米氏散射').onChange(syncSun).onFinishChange(rebuildEnv);
fSky.add(params, 'mieDirectionalG', 0, 0.99, 0.01).name('阳光散射方向').onChange(syncSun).onFinishChange(rebuildEnv);
fSky.add(params, 'clouds').name('云层').onChange(syncAll);
fSky.add(params, 'birds').name('飞鸟').onChange(syncAll);
fSky.add(params, 'motes').name('浮尘光斑').onChange(syncAll);

const fScene = gui.addFolder('场景');
fScene.add(params, 'fogDensity', 0, 0.04, 0.0005).name('雾浓度').onChange(syncAll);
fScene.add(params, 'shadows').name('阴影').onChange(syncAll);
fScene.add(params, 'smoke').name('炊烟').onChange(syncAll);
fScene.add({ reset: () => { camera.position.set(8.6, 1.62, 11.0); controls.target.set(0.3, 1.35, 0.6); } }, 'reset').name('重置视角');

const fPost = gui.addFolder('后期');
fPost.add(params, 'exposure', 0.4, 2.5, 0.01).name('曝光(色调映射)').onChange(syncAll);
fPost.add(params, 'saturation', 0.5, 1.6, 0.01).name('饱和度').onChange(syncAll);
fPost.add(params, 'contrast', 0.7, 1.5, 0.01).name('对比度').onChange(syncAll);
fPost.add(params, 'sharpen', 0, 0.8, 0.01).name('锐化').onChange(syncAll);
fPost.add(params, 'vignette', 0, 0.9, 0.01).name('暗角').onChange(syncAll);
fPost.add(params, 'grain', 0, 0.06, 0.001).name('颗粒').onChange(syncAll);
fPost.add(params, 'chromatic', 0, 0.008, 0.0002).name('色差').onChange(syncAll);
fPost.add(params, 'bloomStrength', 0, 1.2, 0.01).name('泛光强度').onChange(syncAll);
fPost.add(params, 'bloomRadius', 0, 1.2, 0.01).name('泛光半径').onChange(syncAll);
fPost.add(params, 'bloomThreshold', 0.4, 1.6, 0.01).name('泛光阈值').onChange(syncAll);
fPost.add(params, 'aa').name('抗锯齿(SMAA)').onChange(syncAll);

/* ============================ 自适应 ============================ */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  postfx.setSize(renderer.domElement.width, renderer.domElement.height);
  updateProjectionScale();
}
window.addEventListener('resize', onResize);

/* ============================ 启动 ============================ */
controls.target.set(0.3, 1.35, 0.6);
camera.position.set(8.6, terrainHeight(8.6, 11.0) + 1.45, 11.0);

buildFoliage();
rebuildEnv();
onResize();

/* ============================ 主循环 ============================ */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, fpsTimer = 0, fps = 0, degraded = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  controls.update();

  for (const o of [grass, cards, flowers]) if (o) o.uniforms.uTime.value = t;
  clouds.update(t);
  birds.uniforms.uTime.value = t;
  motes.uniforms.uTime.value = t;
  cabin.smoke.uniforms.uTime.value = t;

  postfx.render(t);

  // 帧率统计 + 自适应降级
  frames++; fpsAcc += dt; fpsTimer += dt;
  if (fpsTimer > 0.5) {
    fps = frames / fpsAcc;
    frames = 0; fpsAcc = 0; fpsTimer = 0;
    if (statEl) {
      statEl.textContent = `${fps.toFixed(0)} FPS · 草叶 ${grass ? grass.count.toLocaleString() : 0} · 草丛卡片 ${cards ? cards.count.toLocaleString() : 0}`;
    }
    if (fps < 26 && degraded < 3 && renderer.getPixelRatio() > 0.76) {
      renderer.setPixelRatio(Math.max(0.75, renderer.getPixelRatio() - 0.25));
      onResize();
      degraded++;
    }
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') {
    gui.domElement.style.display = gui.domElement.style.display === 'none' ? '' : 'none';
  }
});

window.__meadow = { scene, camera, renderer, controls, params, cabin, fence, nature, postfx, terrain, get grass() { return grass; }, get cards() { return cards; } };
