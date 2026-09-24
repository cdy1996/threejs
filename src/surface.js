import * as THREE from 'three';
import { TANK, COLORS, toonMaterial } from './utils.js';

/**
 * 水面漂浮物：渔船 + 救生圈
 * 固定在水面高度，正弦上下漂浮 + 轻微摇摆
 */

function buildBoat() {
  const boat = new THREE.Group();

  // 船体：简单梯形船壳（两侧收窄的盒子 + 首尖）
  const hull = new THREE.Group();

  const hullMat = toonMaterial(COLORS.boatHull);
  const cabinMat = toonMaterial(COLORS.boatCabin);

  // 船底 + 侧板（用缩放盒子近似卡通船体）
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.95), hullMat);
  bottom.position.y = 0.09;
  hull.add(bottom);

  const sideL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.1), hullMat);
  sideL.position.set(0, 0.35, 0.48);
  hull.add(sideL);
  const sideR = sideL.clone();
  sideR.position.z = -0.48;
  hull.add(sideR);

  const stern = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.95), hullMat);
  stern.position.set(-1.15, 0.35, 0);
  hull.add(stern);

  // 船头：楔形（旋转的四棱锥）
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.9, 4), hullMat);
  bow.rotation.z = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(1, 1, 0.44);
  bow.position.set(1.6, 0.18, 0);
  hull.add(bow);

  // 座舱
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.6), cabinMat);
  cabin.position.set(-0.55, 0.75, 0);
  hull.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.09, 0.76), hullMat);
  roof.position.set(-0.55, 1.05, 0);
  hull.add(roof);

  // 桅杆 + 小旗
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), cabinMat);
  mast.position.set(0.45, 1.2, 0);
  hull.add(mast);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.24),
    new THREE.MeshToonMaterial({ color: 0xff5a4e, side: THREE.DoubleSide })
  );
  flag.position.set(0.68, 1.78, 0);
  hull.add(flag);

  boat.add(hull);
  return boat;
}

function buildLifeRing() {
  const ring = new THREE.Group();
  const white = toonMaterial(0xf5f5f0);
  const red = toonMaterial(0xe8503f);

  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.14, 10, 24), white);
  ring.add(torus);

  // 4 段红色弧块
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.145, 10, 7, Math.PI / 5),
      red
    );
    seg.rotation.z = (i * Math.PI) / 2 + Math.PI / 12;
    ring.add(seg);
  }
  ring.rotation.x = Math.PI / 2; // 平躺水面
  return ring;
}

// 与 aquarium.js surfaceVertex 的波形保持一致（改那边时同步这里）
const WAVE_DEFS = [
  [1.0, 0.45, 0.95, 0.5, 1.15],
  [-0.35, 1.0, 1.3, 0.32, 0.9],
  [0.8, -0.7, 2.1, 0.16, 1.6],
  [-0.6, -0.8, 3.1, 0.09, 2.1]
];
const BOAT_YAW = 0.5;

const smoothstep = (e0, e1, x) => {
  const u = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return u * u * (3 - 2 * u);
};

/** 世界坐标 (x,z) 处的水面高度，复现水面顶点着色器的波形 */
function waveHeight(x, z, t, amp, radius) {
  const damp = 1 - smoothstep(0.72, 0.995, Math.hypot(x, z) / radius) * 0.3;
  let h = 0;
  for (const [dx, dy, k, a, w] of WAVE_DEFS) {
    const len = Math.hypot(dx, dy);
    h += a * Math.sin(((dx / len) * x + (dy / len) * z) * k - t * w);
  }
  h += 0.14 * Math.sin(Math.hypot(x, z) * 1.4 - t * 1.7);
  return h * damp * amp;
}

export function createSurfaceProps() {
  const group = new THREE.Group();

  const boat = buildBoat();
  boat.position.set(-1.8, TANK.waterTopY - 0.12, 0.6);
  boat.rotation.y = 0.5;
  group.add(boat);

  const ring = buildLifeRing();
  ring.position.set(2.1, TANK.waterTopY + 0.06, -1.4);
  group.add(ring);

  const boatBaseY = boat.position.y;
  const ringBaseY = ring.position.y;

  return {
    group,
    setBoatScale(s) {
      boat.scale.setScalar(s);
    },
    update(t, amp = 0.3) {
      const r = TANK.waterRadius;

      // 船：高度贴合波面，倾斜由波面数值梯度求出
      const bx = boat.position.x;
      const bz = boat.position.z;
      const bh = waveHeight(bx, bz, t, amp, r);
      boat.position.y = boatBaseY + bh;

      const eps = 0.4;
      const dhdx = (waveHeight(bx + eps, bz, t, amp, r) - bh) / eps;
      const dhdz = (waveHeight(bx, bz + eps, t, amp, r) - bh) / eps;
      const c = Math.cos(BOAT_YAW);
      const s = Math.sin(BOAT_YAW);
      boat.rotation.z = dhdx * c - dhdz * s;
      boat.rotation.x = -(dhdx * s + dhdz * c);

      // 救生圈：跟随波高 + 轻微摇摆
      ring.position.y = ringBaseY + waveHeight(ring.position.x, ring.position.z, t, amp, r);
      ring.rotation.z = Math.sin(t * 0.8) * 0.08;
    }
  };
}
