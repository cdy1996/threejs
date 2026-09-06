import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { params } from './config.js';
import { createStarfield } from './starfield.js';
import { DiskSystem } from './disk.js';
import { FormulaField } from './formulaField.js';
import { createLensPass, updateLensUniforms } from './lensPass.js';
import { createPanel } from './panel.js';

// ---------- 渲染器 / 场景 / 相机 ----------
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = params.exposure;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020204);

const camera = new THREE.PerspectiveCamera(params.camera.fov, innerWidth / innerHeight, 0.1, 1000);
const DEFAULT_VIEW = { pos: new THREE.Vector3(0.8, 2.6, 10.5), target: new THREE.Vector3(0, 0.3, 0) };
camera.position.copy(DEFAULT_VIEW.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(DEFAULT_VIEW.target);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 3;
controls.maxDistance = 60;
controls.autoRotate = params.camera.autoRotate;
controls.autoRotateSpeed = params.camera.speed;

// ---------- 场景内容 ----------
scene.add(createStarfield());
const diskSystem = new DiskSystem(scene, params);
const formulaField = new FormulaField(scene, params);
formulaField.rebuild();

// ---------- 后处理：渲染 -> 引力透镜 -> Bloom -> 输出 ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const lensPass = createLensPass();
composer.addPass(lensPass);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  params.bloom.strength, params.bloom.radius, params.bloom.threshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ---------- GUI 回调 ----------
const hooks = {
  rebuildBlackhole: () => diskSystem.rebuild(),
  rebuildDisk: () => { diskSystem.rebuild(); formulaField.rebuild(); },
  rebuildFormulas: () => formulaField.rebuild(),
  updateFormulaStyle: () => formulaField.applyStyle(),
  updateFov: () => { camera.fov = params.camera.fov; camera.updateProjectionMatrix(); },
  resetView: () => {
    camera.position.copy(DEFAULT_VIEW.pos);
    controls.target.copy(DEFAULT_VIEW.target);
  },
};
createPanel(params, hooks);

// ---------- 自适应 ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- 主循环 ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  controls.autoRotateSpeed = params.camera.speed;
  controls.update();

  diskSystem.update(t);
  formulaField.update(dt);

  // 透镜参数同步
  lensPass.uniforms.uStrength.value = params.lens.strength;
  lensPass.uniforms.uRange.value = params.lens.range;
  lensPass.uniforms.uSwirl.value = params.lens.swirl;
  updateLensUniforms(lensPass, camera, diskSystem.horizon, params.blackhole.radius, innerWidth / innerHeight);

  // 后期参数同步
  bloomPass.strength = params.bloom.strength;
  bloomPass.radius = params.bloom.radius;
  bloomPass.threshold = params.bloom.threshold;
  renderer.toneMappingExposure = params.exposure;

  composer.render();
}
animate();
