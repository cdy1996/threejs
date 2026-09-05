import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';
import { TANK } from './utils.js';

/**
 * 相机：开场 GSAP 自动运镜（环绕 → 推进入水 → 水下特写），
 * 结束后交给 OrbitControls 自由查看；每帧检测相机是否在水中。
 */

export function createCameraRig(renderer, scene) {
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 17, 24);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 5.2, 0);
  controls.maxDistance = 60;
  controls.minDistance = 0.5;
  controls.enabled = false; // 运镜期间锁定

  // 环绕轨道参数代理
  const orbit = { angle: Math.PI / 2, radius: 24, height: 17 };
  const lookTarget = new THREE.Vector3(0, 5.2, 0);
  let introDone = false;

  function applyOrbit() {
    camera.position.set(
      Math.sin(orbit.angle) * orbit.radius,
      orbit.height,
      Math.cos(orbit.angle) * orbit.radius
    );
    camera.lookAt(lookTarget);
  }

  const tl = gsap.timeline({
    onComplete() {
      introDone = true;
      controls.enabled = true;
      controls.target.set(0, 5.2, 0);
      controls.update();
    }
  });

  // 第一幕：环绕旋转一圈，缓缓下降
  tl.to(orbit, { angle: orbit.angle + Math.PI * 2, duration: 9, ease: 'none', onUpdate: applyOrbit })
    .to(orbit, { height: 9, radius: 17, duration: 9, ease: 'sine.inOut', onUpdate: applyOrbit }, 0)
    // 第二幕：推进并钻入水体
    .to(orbit, {
      angle: orbit.angle + Math.PI * 2 + 0.6,
      radius: 4.2,
      height: 5.6,
      duration: 5,
      ease: 'power2.inOut',
      onUpdate: applyOrbit
    })
    // 第三幕：水下特写缓慢漂移
    .to(orbit, { radius: 2.2, height: 4.2, angle: '+=1.4', duration: 6, ease: 'sine.inOut', onUpdate: applyOrbit })
    .to({}, { duration: 0.4 });

  applyOrbit();

  /** 水下状态：true = 相机在水面以下 */
  function updateUnderwater() {
    const under = camera.position.y < TANK.waterTopY && insideTankXZ(camera.position);
    return under;
  }

  function insideTankXZ(p) {
    const r = TANK.waterRadius;
    return Math.abs(p.x) * 1.5 + Math.abs(p.z) * 0.866 <= r * 1.5;
  }

  return {
    camera,
    controls,
    update(dt) {
      if (introDone) controls.update();
    },
    isUnderwater: updateUnderwater,
    skipIntro() {
      if (!introDone) {
        tl.progress(1);
      }
    }
  };
}
