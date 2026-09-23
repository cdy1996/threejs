// 海面漂流瓶 · 场景入口
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { createWater } from './water.js';
import { createSky } from './sky.js';
import { createBottle } from './bottle.js';
import { sampleHeight, sampleNormal } from './waves.js';

// ---------- 可调参数（控制面板绑定） ----------
const params = {
  // 海面
  amplitude: 0.5,        // 波高系数
  speed: 1.0,            // 波速系数
  chop: 0.9,             // 浪尖尖锐度（水平位移）
  dirAngleDeg: 25,       // 主浪向（度）
  detail: 0.35,          // 高频涟漪强度
  foamAmount: 1.0,       // 浪尖泡沫量
  deepColor: '#06364e',
  shallowColor: '#1a7d8c',
  fogColor: '#b8cdd6',
  fogDensity: 0.0028,
  // 天空 / 太阳
  elevation: 24,         // 太阳高度角（度）
  azimuth: 210,          // 太阳方位角（度）
  sunColor: '#fff2dc',
  sunIntensity: 1.2,     // 水面太阳高光强度
  horizonColor: '#cfd8de',
  zenithColor: '#5a93c4',
  cloudCover: 0.45,
  // 漂流瓶
  driftSpeed: 0.6,       // 漂流速度 m/s
  floatOffset: 0.03,     // 吃水深度
  tiltInfluence: 0.85,   // 随浪倾斜程度 0~1
  sway: 1.0,             // 摇摆幅度
  glassColor: '#9fd4b4',
  bottleScale: 10,       // 瓶子显示大小
  follow: true,          // 相机跟随瓶子
};

// ---------- 渲染器 / 场景 ----------
const container = document.getElementById('scene-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color(params.fogColor), 90, 500);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(14, 6, 18);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 3;
controls.maxDistance = 200;
controls.target.set(4, 0.5, 3);

// ---------- 天空 / 海面 / 光照 ----------
const sky = createSky();
scene.add(sky.mesh);

const water = createWater();
scene.add(water.mesh);

const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
scene.add(sunLight);
const hemi = new THREE.HemisphereLight(0xbfd8e8, 0x1a3a4a, 0.5);
scene.add(hemi);

const bottle = createBottle();
scene.add(bottle.group);

// 初始机位贴近瓶子，保证第一眼就能看到
camera.position.set(bottle.pos.x + 10, 5.5, bottle.pos.z + 12);
controls.target.copy(bottle.group.position);

// 用天空生成环境贴图（玻璃瓶的反射/折射来源）
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
function rebuildEnv() {
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.mesh.geometry, sky.mesh.material));
  const rt = pmrem.fromScene(envScene, 0.04);
  scene.environment = rt.texture;
  if (envRT) envRT.dispose();
  envRT = rt;
}

function sunDir() {
  const el = THREE.MathUtils.degToRad(params.elevation);
  const az = THREE.MathUtils.degToRad(params.azimuth);
  return new THREE.Vector3(
    Math.cos(el) * Math.cos(az),
    Math.sin(el),
    Math.cos(el) * Math.sin(az)
  );
}

// 参数 -> 各系统同步
function sync() {
  const sd = sunDir();

  const wu = water.uniforms;
  wu.uAmplitude.value = params.amplitude;
  wu.uSpeed.value = params.speed;
  wu.uChop.value = params.chop;
  wu.uDirAngle.value = THREE.MathUtils.degToRad(params.dirAngleDeg);
  wu.uDetail.value = params.detail;
  wu.uFoamAmount.value = params.foamAmount;
  wu.uDeepColor.value.set(params.deepColor);
  wu.uShallowColor.value.set(params.shallowColor);
  wu.uHorizonColor.value.set(params.horizonColor);
  wu.uZenithColor.value.set(params.zenithColor);
  wu.uSunDir.value.copy(sd);
  wu.uSunColor.value.set(params.sunColor);
  wu.uSunSpecular.value = params.sunIntensity;
  wu.uFogColor.value.set(params.fogColor);
  wu.uFogDensity.value = params.fogDensity;

  const su = sky.uniforms;
  su.uHorizon.value.set(params.horizonColor);
  su.uZenith.value.set(params.zenithColor);
  su.uSunDir.value.copy(sd);
  su.uSunColor.value.set(params.sunColor);
  su.uCloudCover.value = params.cloudCover;

  scene.fog.color.set(params.fogColor);
  sunLight.color.set(params.sunColor);
  sunLight.position.copy(sd).multiplyScalar(150);

  bottle.glassMat.color.set(params.glassColor);
  bottle.glassMat.attenuationColor.set(params.glassColor);
  bottle.group.scale.setScalar(params.bottleScale);
}

// ---------- 波面采样（供瓶子使用，与顶点着色器公式一致） ----------
const sampler = {
  height(x, z, t) {
    return sampleHeight(x, z, t, {
      amplitude: params.amplitude,
      speed: params.speed,
      dirAngle: THREE.MathUtils.degToRad(params.dirAngleDeg),
    });
  },
  normal(x, z, t, out) {
    return sampleNormal(x, z, t, {
      amplitude: params.amplitude,
      speed: params.speed,
      dirAngle: THREE.MathUtils.degToRad(params.dirAngleDeg),
    }, out);
  },
};

// ---------- 控制面板 ----------
const gui = new GUI({ title: '海面与漂流瓶' });

const fOcean = gui.addFolder('海面');
fOcean.add(params, 'amplitude', 0.05, 1.5, 0.01).name('波高').onChange(sync);
fOcean.add(params, 'speed', 0.1, 3.0, 0.01).name('波速').onChange(sync);
fOcean.add(params, 'chop', 0, 1.5, 0.01).name('浪尖尖锐度').onChange(sync);
fOcean.add(params, 'dirAngleDeg', 0, 360, 1).name('主浪向(°)').onChange(sync);
fOcean.add(params, 'detail', 0, 1, 0.01).name('涟漪细节').onChange(sync);
fOcean.add(params, 'foamAmount', 0, 2.5, 0.01).name('泡沫量').onChange(sync);
fOcean.addColor(params, 'deepColor').name('深水色').onChange(sync);
fOcean.addColor(params, 'shallowColor').name('浅水色').onChange(sync);
fOcean.add(params, 'fogDensity', 0, 0.01, 0.0001).name('雾浓度').onChange(sync);
fOcean.addColor(params, 'fogColor').name('雾色').onChange(sync);

const fSky = gui.addFolder('天空与太阳');
fSky.add(params, 'elevation', 1, 85, 0.5).name('太阳高度角').onChange(sync).onFinishChange(rebuildEnv);
fSky.add(params, 'azimuth', 0, 360, 1).name('太阳方位角').onChange(sync).onFinishChange(rebuildEnv);
fSky.addColor(params, 'sunColor').name('太阳颜色').onChange(sync).onFinishChange(rebuildEnv);
fSky.add(params, 'sunIntensity', 0, 4, 0.05).name('高光强度').onChange(sync);
fSky.addColor(params, 'horizonColor').name('地平线色').onChange(sync).onFinishChange(rebuildEnv);
fSky.addColor(params, 'zenithColor').name('天顶色').onChange(sync).onFinishChange(rebuildEnv);
fSky.add(params, 'cloudCover', 0, 1, 0.01).name('云量').onChange(sync).onFinishChange(rebuildEnv);

const fBottle = gui.addFolder('漂流瓶');
fBottle.add(params, 'driftSpeed', 0, 3, 0.01).name('漂流速度');
fBottle.add(params, 'floatOffset', -0.05, 0.15, 0.005).name('吃水深度');
fBottle.add(params, 'tiltInfluence', 0, 1, 0.01).name('随浪倾斜');
fBottle.add(params, 'sway', 0, 2, 0.01).name('摇摆幅度');
fBottle.addColor(params, 'glassColor').name('玻璃颜色').onChange(sync);
fBottle.add(params, 'bottleScale', 0.5, 20, 0.1).name('瓶子大小').onChange(sync);
fBottle.add(params, 'follow').name('相机跟随');
fBottle.add({ respawn: () => bottle.respawn() }, 'respawn').name('重新投放');

// ---------- 主循环 ----------
sync();
rebuildEnv();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  water.uniforms.uTime.value = t;
  sky.uniforms.uTime.value = t;

  bottle.update(t, dt, sampler, params);
  if (params.follow) controls.target.lerp(bottle.group.position, 0.08);

  controls.update();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
