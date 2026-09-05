import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';
import { TANK } from './utils.js';

/**
 * 相机：GSAP 自动运镜（环绕 → 推进入水 → 水下特写），默认不自动播放，
 * 由控制面板开关或双击触发；结束后交给 OrbitControls 自由查看。
 * 每帧检测相机是否在水中。
 */

export function createCameraRig(renderer, scene) {
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 5.2, 0);
  controls.maxDistance = 60;
  controls.minDistance = 0.5;

  // 环绕轨道参数代理（默认视角：全景稍俯视）
  const orbit = { angle: Math.PI / 2, radius: 19, height: 12 };
  const lookTarget = new THREE.Vector3(0, 5.2, 0);
  let introDone = true; // 默认不自动播放，交由控制面板开启

  function applyOrbit() {
    camera.position.set(
      Math.sin(orbit.angle) * orbit.radius,
      orbit.height,
      Math.cos(orbit.angle) * orbit.radius
    );
    camera.lookAt(lookTarget);
  }

  const tl = gsap.timeline({
    paused: true,
    onComplete() {
      introDone = true;
      controls.enabled = true;
      controls.target.set(0, 5.2, 0);
      controls.update();
    }
  });

  // 第一幕：环绕旋转一圈，缓缓下降
  tl.to(orbit, { angle: '+=6.283', duration: 9, ease: 'none', onUpdate: applyOrbit })
    .to(orbit, { height: 9, radius: 15, duration: 9, ease: 'sine.inOut', onUpdate: applyOrbit }, 0)
    // 第二幕：推进并钻入水体
    .to(orbit, {
      angle: '+=6.883',
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

  /** 播放开场运镜动画 */
  function playIntro() {
    introDone = false;
    controls.enabled = false;
    tl.restart();
  }

  /** 停止动画，回到自由查看 */
  function stopIntro() {
    tl.pause();
    if (!introDone) {
      introDone = true;
      controls.enabled = true;
      controls.target.set(0, 5.2, 0);
      controls.update();
    }
  }

  /** 水下状态：true = 相机在水面以下 */
  function isUnderwater() {
    return camera.position.y < TANK.waterTopY && insideTankXZ(camera.position);
  }

  function insideTankXZ(p) {
    return Math.sqrt(p.x * p.x + p.z * p.z) <= TANK.waterRadius;
  }

  return {
    camera,
    controls,
    playIntro,
    stopIntro,
    update(dt) {
      if (introDone) controls.update();
      // 调试：暴露相机状态
      window.__camState = {
        pos: camera.position.toArray().map(x => +x.toFixed(1)),
        introDone,
        tlTime: +tl.time().toFixed(1)
      };
    },
    isUnderwater
  };
}
