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
    update(t) {
      boat.position.y = boatBaseY + Math.sin(t * 1.1) * 0.07;
      boat.rotation.z = Math.sin(t * 0.9) * 0.05;
      boat.rotation.x = Math.cos(t * 0.7) * 0.04;
      ring.position.y = ringBaseY + Math.sin(t * 1.4 + 1.2) * 0.06;
      ring.rotation.z = Math.sin(t * 0.8) * 0.08;
    }
  };
}
