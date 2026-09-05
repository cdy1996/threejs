import * as THREE from 'three';
import { TANK, rand } from './utils.js';

/**
 * 鱼群：InstancedMesh 渲染约 650 条片状卡通小鱼
 * 漩涡式游动：所有鱼绕中心同向公转，半径/高度各异并带呼吸漂移，
 * 形成鱼群漩涡；限制在水体六棱柱内部
 */

const FISH_COUNT = 650;
const BOUND = {
  rMax: TANK.waterRadius - 1.1,   // 最大公转半径
  minY: 2.6,
  maxY: 8.0
};

function makeFishShape() {
  const s = new THREE.Shape();
  // 鱼身（纺锤形）
  s.moveTo(0.5, 0);
  s.quadraticCurveTo(0.1, 0.24, -0.32, 0.08);
  // 尾巴
  s.lineTo(-0.52, 0.22);
  s.lineTo(-0.44, 0);
  s.lineTo(-0.52, -0.22);
  s.lineTo(-0.32, -0.08);
  s.quadraticCurveTo(0.1, -0.24, 0.5, 0);
  return new THREE.ShapeGeometry(s, 8);
}

// 黄绿系 + 青蓝系 两套色调
const PALETTE = [
  0xffd54f, 0xffb300, 0xffe082, 0x9ccc65, 0x8bc34a,
  0x4dd0e1, 0x29b6f6, 0x80deea, 0x26c6da, 0xfff176
];

export function createFishSchool(count = FISH_COUNT) {
  const TOTAL = count;
  const geometry = makeFishShape();
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.96
  });

  const mesh = new THREE.InstancedMesh(geometry, material, TOTAL);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;

  // 每条鱼的漩涡轨道参数
  const orbitR = new Float32Array(TOTAL);   // 公转半径
  const angle = new Float32Array(TOTAL);    // 当前相位角
  const angSpeed = new Float32Array(TOTAL); // 角速度
  const baseY = new Float32Array(TOTAL);    // 基准高度
  const bobAmp = new Float32Array(TOTAL);   // 上下浮动幅度
  const bobFreq = new Float32Array(TOTAL);  // 浮动频率
  const phase = new Float32Array(TOTAL);    // 个体相位
  const prevPos = new Float32Array(TOTAL * 3);

  const color = new THREE.Color();
  for (let i = 0; i < TOTAL; i++) {
    // 半径分布偏向中层，形成饱满的漩涡锥
    const t = Math.random();
    orbitR[i] = 0.6 + Math.sqrt(t) * (BOUND.rMax - 0.6);
    angle[i] = Math.random() * Math.PI * 2;
    angSpeed[i] = rand(0.45, 0.95) * (orbitR[i] < BOUND.rMax * 0.4 ? 1.25 : 1.0); // 内圈游得更快
    baseY[i] = rand(BOUND.minY, BOUND.maxY);
    bobAmp[i] = rand(0.15, 0.55);
    bobFreq[i] = rand(0.5, 1.3);
    phase[i] = Math.random() * Math.PI * 2;

    const a = angle[i];
    const r = orbitR[i];
    prevPos[i * 3] = Math.cos(a) * r;
    prevPos[i * 3 + 1] = baseY[i];
    prevPos[i * 3 + 2] = Math.sin(a) * r;

    color.setHex(PALETTE[(Math.random() * PALETTE.length) | 0]);
    const l = rand(0.82, 1.08);
    color.r = Math.min(1, color.r * l);
    color.g = Math.min(1, color.g * l);
    color.b = Math.min(1, color.b * l);
    mesh.setColorAt(i, color);
  }
  mesh.instanceColor.needsUpdate = true;

  const dummy = new THREE.Object3D();

  function update(t, dt) {
    const dtc = Math.min(dt, 0.05);
    for (let i = 0; i < TOTAL; i++) {
      // 公转 + 内外呼吸漂移
      angle[i] += angSpeed[i] * dtc;
      const r = orbitR[i] + Math.sin(t * 0.5 + phase[i]) * 0.45;
      const a = angle[i];
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = baseY[i] + Math.sin(t * bobFreq[i] + phase[i]) * bobAmp[i];

      // 朝向 = 位移方向
      const dx = x - prevPos[i * 3];
      const dy = y - prevPos[i * 3 + 1];
      const dz = z - prevPos[i * 3 + 2];
      prevPos[i * 3] = x; prevPos[i * 3 + 1] = y; prevPos[i * 3 + 2] = z;

      dummy.position.set(x, y, z);
      // 鱼头在 +X：偏航角对齐水平运动方向
      dummy.rotation.set(0, -Math.atan2(dz, dx), 0);
      // 摆尾
      dummy.rotateY(Math.sin(t * 8.0 + phase[i]) * 0.18);
      // 轻微侧倾
      dummy.rotateZ(Math.sin(t * 1.5 + phase[i]) * 0.08);
      const scale = 0.28 + (orbitR[i] / BOUND.rMax) * 0.35; // 外圈鱼稍大
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update };
}
