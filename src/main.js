import * as THREE from 'three';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { TANK, COLORS } from './utils.js';
import { createAquarium } from './aquarium.js';
import { createSeabed } from './seabed.js';
import { createFishSchool } from './fish.js';
import { createSurfaceProps } from './surface.js';
import { createBubbles } from './bubbles.js';
import { createCameraRig } from './camera.js';
import { createSky } from './sky.js';
import { createPostFX } from './postfx.js';

// ---------- 基础初始化 ----------
const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.bgSky);
scene.fog = new THREE.FogExp2(COLORS.fogSky, 0.012);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const cameraRig = createCameraRig(renderer, scene);
const { camera, controls } = cameraRig;
window.__cam = camera; // 调试：供浏览器验证用
window.__ctl = controls;
window.__scene = scene;

// ---------- 灯光（柔和卡通，无硬阴影） ----------
const dirLight = new THREE.DirectionalLight(0xfff6e8, 1.0);
dirLight.position.set(8, 15, 6);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xdff6f2, 0.75));
const hemi = new THREE.HemisphereLight(0xbfeee8, 0x3d6b5e, 0.5);
scene.add(hemi);

// ---------- 天空盒 ----------
const sky = createSky();
scene.add(sky.mesh);

// ---------- 场景内容 ----------
const aquarium = createAquarium();
scene.add(aquarium.group);
window.__surfU = aquarium.surfaceMat.uniforms; // 调试：供浏览器验证用
window.__aq = aquarium.group;

const seabed = createSeabed();
scene.add(seabed.group);

let fishSchool = createFishSchool();
scene.add(fishSchool.mesh);

const bubbles = createBubbles();
scene.add(bubbles.points);
window.__bubbles = bubbles; // 调试：供浏览器验证用

const surfaceProps = createSurfaceProps();
scene.add(surfaceProps.group);

// ---------- 后处理 ----------
const postfx = createPostFX(renderer, scene, camera);

// ---------- 可调参数 + GUI 控制面板 ----------
const params = {
  playIntro: false,
  boatScale: 1.0,
  fishCount: 650,
  fishSpeed: 1.0,
  waveAmp: 0.3,
  surfaceOpacity: 1.0,
  underAlpha: 0.0,
  waterOpacity: 1.0,
  surfaceShallow: '#7fdecd',
  surfaceDeep: '#0c5f6a',
  bubbleCount: 150,
  foamOn: true,
  foamStrength: 1.0,
  foamScale: 2.6,
  foamWake: 1.0,
  // 水面分层开关
  lNorm: true,
  lDiff: true,
  lColor: true,
  lRelief: true,
  lSss: true,
  lFres: true,
  lSpec: true,
  specSharp: 160,
  specWideSharp: 24,
  specInt: 1.5,
  specWideInt: 0.16,
  bgColor: '#8fd0cc'
};

const bgSky = new THREE.Color(params.bgColor);
const bgUnder = new THREE.Color(COLORS.bgUnder);
const fogSky = new THREE.Color(params.bgColor).lerp(new THREE.Color(0xffffff), 0.15);
const fogUnder = new THREE.Color(COLORS.fogUnder);

const gui = new GUI({ title: '控制面板' });
const fAnim = gui.addFolder('动画');
fAnim.add(params, 'playIntro').name('播放运镜动画').onChange(v => (v ? cameraRig.playIntro() : cameraRig.stopIntro()));

const fBoat = gui.addFolder('船');
fBoat.add(params, 'boatScale', 0.4, 2.2, 0.01).name('大小').onChange(v => {
  surfaceProps.setBoatScale(v);
  aquarium.surfaceMat.uniforms.uBoatScale.value = v;
});

const fFoam = gui.addFolder('泡沫');
const su = aquarium.surfaceMat.uniforms;
fFoam.add(params, 'foamOn').name('开启').onChange(v => (su.uFoamOn.value = v ? 1 : 0));
fFoam.add(params, 'foamStrength', 0, 2, 0.01).name('强度').onChange(v => (su.uFoamStrength.value = v));
fFoam.add(params, 'foamScale', 2, 12, 0.1).name('细腻度').onChange(v => (su.uFoamScale.value = v));
fFoam.add(params, 'foamWake', 0, 2, 0.01).name('船尾尾迹').onChange(v => (su.uFoamWake.value = v));

// 水面分层：逐层开关，便于对照参考图判断哪层该留
const fLayer = gui.addFolder('水面分层');
fLayer.add(params, 'lNorm').name('① 法线扰动').onChange(v => (su.uLNormOn.value = v ? 1 : 0));
fLayer.add(params, 'lDiff').name('② 坡面明暗').onChange(v => (su.uLDiffOn.value = v ? 1 : 0));
fLayer.add(params, 'lColor').name('③ 深浅色块').onChange(v => (su.uLColorOn.value = v ? 1 : 0));
fLayer.add(params, 'lRelief').name('④ 伪立体光影').onChange(v => (su.uLReliefOn.value = v ? 1 : 0));
fLayer.add(params, 'lSss').name('⑤ 波峰透光').onChange(v => (su.uLSssOn.value = v ? 1 : 0));
fLayer.add(params, 'lFres').name('⑥ 菲涅尔反射').onChange(v => (su.uLFresOn.value = v ? 1 : 0));
fLayer.add(params, 'lSpec').name('⑦ 太阳高光').onChange(v => (su.uLSpecOn.value = v ? 1 : 0));
fLayer.add(params, 'specSharp', 8, 600, 1).name('高光锐度').onChange(v => (su.uSpecSharp.value = v));
fLayer.add(params, 'specWideSharp', 4, 120, 1).name('宽高光锐度').onChange(v => (su.uSpecWideSharp.value = v));
fLayer.add(params, 'specInt', 0, 5, 0.01).name('高光强度').onChange(v => (su.uSpecInt.value = v));
fLayer.add(params, 'specWideInt', 0, 1, 0.01).name('宽高光强度').onChange(v => (su.uSpecWideInt.value = v));

const fFish = gui.addFolder('鱼群');
fFish.add(params, 'fishCount', 100, 1500, 10).name('数量').onFinishChange(v => rebuildFish(v));
fFish.add(params, 'fishSpeed', 0.2, 3, 0.01).name('速度');

const fBubble = gui.addFolder('气泡');
fBubble.add(params, 'bubbleCount', 0, 400, 1).name('数量').onChange(v => bubbles.setCount(v));

const fWater = gui.addFolder('水');
fWater.add(params, 'waveAmp', 0, 0.45, 0.005).name('波浪幅度').onChange(v => {
  aquarium.surfaceMat.uniforms.uWaveAmp.value = v;
});
fWater.add(params, 'surfaceOpacity', 0.1, 1, 0.01).name('水面透明度').onChange(v => {
  aquarium.surfaceMat.uniforms.uOpacity.value = v;
});
fWater.add(params, 'underAlpha', 0, 1, 0.01).name('仰视不透明度').onChange(v => {
  aquarium.surfaceMat.uniforms.uUnderAlpha.value = v;
});
fWater.add(params, 'waterOpacity', 0.1, 1, 0.01).name('水体透明度').onChange(v => {
  aquarium.waterMat.uniforms.uWaterOpacity.value = v;
});
fWater.addColor(params, 'surfaceShallow').name('水面亮色').onChange(v => {
  aquarium.surfaceMat.uniforms.uShallowColor.value.set(v);
});
fWater.addColor(params, 'surfaceDeep').name('水面深色').onChange(v => {
  aquarium.surfaceMat.uniforms.uDeepColor.value.set(v);
});

const fEnv = gui.addFolder('环境');
fEnv.addColor(params, 'bgColor').name('背景颜色').onChange(v => {
  bgSky.set(v);
  fogSky.set(v).lerp(new THREE.Color(0xffffff), 0.15);
});

// 鱼群数量变更：销毁重建
function rebuildFish(count) {
  scene.remove(fishSchool.mesh);
  fishSchool.mesh.geometry.dispose();
  fishSchool.mesh.dispose();
  fishSchool = createFishSchool(count);
  scene.add(fishSchool.mesh);
}

// ---------- 水下状态切换 ----------
let underwaterFactor = 0; // 0 空中 → 1 水下
const fogUnderC = fogUnder;
const bgUnderC = bgUnder;

function applyUnderwaterBlend(target, dt) {
  const k = 1 - Math.pow(0.002, dt); // 平滑趋近
  underwaterFactor += (target - underwaterFactor) * k;
  const f = underwaterFactor;

  scene.fog.color.copy(fogSky).lerp(fogUnderC, f);
  scene.fog.density = THREE.MathUtils.lerp(0.012, 0.16, f);
  scene.background.copy(bgSky).lerp(bgUnderC, f);

  aquarium.waterMat.uniforms.uUnderwater.value = f;
}

// ---------- 主循环 ----------
const clock = new THREE.Clock();
let firstFrame = true;

function loop() {
  requestAnimationFrame(loop);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  aquarium.update(t);
  seabed.update(t);
  bubbles.update(t);
  fishSchool.update(t, dt * params.fishSpeed);
  surfaceProps.update(t, params.waveAmp);
  cameraRig.update(dt);
  applyUnderwaterBlend(cameraRig.isUnderwater() ? 1 : 0, dt);

  sky.uniforms.uTime.value = t;
  sky.mesh.position.copy(camera.position);

  postfx.render(t);

  if (firstFrame) {
    firstFrame = false;
    document.getElementById('loading').classList.add('hide');
  }
}
loop();

// ---------- resize ----------
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postfx.setSize(innerWidth, innerHeight);
});

// 双击停止运镜动画
window.addEventListener('dblclick', () => {
  params.playIntro = false;
  gui.controllersRecursive().forEach(c => c.updateDisplay());
  cameraRig.stopIntro();
});
