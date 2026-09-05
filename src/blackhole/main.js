import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { params, vertexShader, fragmentShader } from './shader.js';

// ---------- 基础 ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = params.exposure;
app.appendChild(renderer.domElement);

// 视角相机（只提供位置与朝向给着色器，场景本身用正交相机渲染全屏三角形）
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.4, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 0, 0);
controls.minDistance = 3.2;
controls.maxDistance = 38;

const scene = new THREE.Scene();
const oCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ---------- 全屏三角形 + 黑洞着色器 ----------
const uniforms = {
  uCamPos: { value: new THREE.Vector3() },
  uCamBasis: { value: new THREE.Matrix3() },
  uTanFov: { value: Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) },
  uAspect: { value: innerWidth / innerHeight },
  uTime: { value: 0 },
  uLens: { value: params.lensing },
  uDiskIn: { value: params.diskInner },
  uDiskOut: { value: params.diskOuter },
  uDensity: { value: params.density },
  uFlow: { value: params.flowSpeed },
  uNoiseScale: { value: params.noiseScale },
  uBeam: { value: params.beamStrength },
  uColHot: { value: new THREE.Color(params.colHot) },
  uColMid: { value: new THREE.Color(params.colMid) },
  uColOuter: { value: new THREE.Color(params.colOuter) }
};

const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthWrite: false, depthTest: false })
);
quad.frustumCulled = false;
scene.add(quad);

// ---------- 后处理：Bloom ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, oCam));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  params.bloomStrength,
  params.bloomRadius,
  params.bloomThreshold
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- GUI 控制面板 ----------
const gui = new GUI({ title: 'Controls' });

const fPost = gui.addFolder('PostProcessing');
const fBloom = fPost.addFolder('Bloom');
fBloom.add(params, 'bloomStrength', 0, 2, 0.01).name('Strength').onChange(v => (bloom.strength = v));
fBloom.add(params, 'bloomRadius', 0, 1, 0.01).name('Radius').onChange(v => (bloom.radius = v));
fBloom.add(params, 'bloomThreshold', 0, 1.5, 0.01).name('Threshold').onChange(v => (bloom.threshold = v));
fPost.add(params, 'exposure', 0.3, 2.5, 0.01).name('Exposure').onChange(v => (renderer.toneMappingExposure = v));

const fBH = gui.addFolder('Black Hole');
fBH.add(params, 'lensing', 0, 2, 0.01).name('Lensing').onChange(v => (uniforms.uLens.value = v));

const fDisk = fBH.addFolder('Disk');
const fColors = fDisk.addFolder('Colors');
fColors.addColor(params, 'colHot').name('Hot').onChange(v => uniforms.uColHot.value.set(v));
fColors.addColor(params, 'colMid').name('Mid1').onChange(v => uniforms.uColMid.value.set(v));
fColors.addColor(params, 'colOuter').name('Outer').onChange(v => uniforms.uColOuter.value.set(v));

const fNoise = fDisk.addFolder('Noise & Flow');
fNoise.add(params, 'flowSpeed', 0, 3, 0.01).name('Flow Speed').onChange(v => (uniforms.uFlow.value = v));
fNoise.add(params, 'noiseScale', 0.3, 3, 0.01).name('Noise Scale').onChange(v => (uniforms.uNoiseScale.value = v));
fNoise.add(params, 'beamStrength', 0, 2, 0.01).name('Doppler Beam').onChange(v => (uniforms.uBeam.value = v));

const fDensity = fDisk.addFolder('Density & Radii');
fDensity.add(params, 'density', 0.5, 12, 0.1).name('Density').onChange(v => (uniforms.uDensity.value = v));
fDensity.add(params, 'diskInner', 2.1, 5, 0.05).name('Inner Radius').onChange(v => (uniforms.uDiskIn.value = v));
fDensity.add(params, 'diskOuter', 6, 20, 0.1).name('Outer Radius').onChange(v => (uniforms.uDiskOut.value = v));

fBH.add(params, 'timeScale', 0, 3, 0.01).name('Time Scale');
fPost.close();
fBH.close();

// ---------- 主循环 ----------
const clock = new THREE.Clock();
let firstFrame = true;

function loop() {
  requestAnimationFrame(loop);
  const dt = clock.getDelta();
  uniforms.uTime.value += dt * params.timeScale;

  controls.update();
  camera.updateMatrixWorld();
  uniforms.uCamPos.value.copy(camera.position);
  uniforms.uCamBasis.value.setFromMatrix4(camera.matrixWorld);
  uniforms.uAspect.value = innerWidth / innerHeight;

  composer.render();

  if (firstFrame) {
    firstFrame = false;
    document.getElementById('loading').classList.add('hide');
  }
}
loop();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
});
