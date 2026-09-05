import * as THREE from 'three';
import { TANK, COLORS } from './utils.js';
import { createAquarium } from './aquarium.js';
import { createSeabed } from './seabed.js';
import { createFishSchool } from './fish.js';
import { createSurfaceProps } from './surface.js';
import { createCameraRig } from './camera.js';
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

// ---------- 灯光（柔和卡通，无硬阴影） ----------
const dirLight = new THREE.DirectionalLight(0xfff6e8, 1.0);
dirLight.position.set(8, 15, 6);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xdff6f2, 0.75));
const hemi = new THREE.HemisphereLight(0xbfeee8, 0x3d6b5e, 0.5);
scene.add(hemi);

// ---------- 场景内容 ----------
const aquarium = createAquarium();
scene.add(aquarium.group);

const seabed = createSeabed();
scene.add(seabed.group);

const fishSchool = createFishSchool();
scene.add(fishSchool.mesh);

const surfaceProps = createSurfaceProps();
scene.add(surfaceProps.group);

// ---------- 后处理 ----------
const postfx = createPostFX(renderer, scene, camera);

// ---------- 水下状态切换 ----------
let underwaterFactor = 0; // 0 空中 → 1 水下
const fogSky = new THREE.Color(COLORS.fogSky);
const fogUnder = new THREE.Color(COLORS.fogUnder);
const bgSky = new THREE.Color(COLORS.bgSky);
const bgUnder = new THREE.Color(COLORS.bgUnder);

function applyUnderwaterBlend(target, dt) {
  const k = 1 - Math.pow(0.002, dt); // 平滑趋近
  underwaterFactor += (target - underwaterFactor) * k;
  const f = underwaterFactor;

  scene.fog.color.copy(fogSky).lerp(fogUnder, f);
  scene.fog.density = THREE.MathUtils.lerp(0.012, 0.16, f);
  scene.background.copy(bgSky).lerp(bgUnder, f);

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
  fishSchool.update(t, dt);
  surfaceProps.update(t);
  cameraRig.update(dt);
  applyUnderwaterBlend(cameraRig.isUnderwater() ? 1 : 0, dt);

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

// 点击跳过开场运镜
window.addEventListener('dblclick', () => cameraRig.skipIntro());
