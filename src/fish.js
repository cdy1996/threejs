import * as THREE from 'three';
import { TANK, rand } from './utils.js';

/**
 * 鱼群：InstancedMesh 渲染约 650 条片状卡通小鱼
 * CPU 噪声 + 群体吸引点驱动，限制在水体六棱柱内部，碰壁反弹
 */

const FISH_COUNT = 650;
const BOUND = {
  r: TANK.waterRadius - 1.0,     // 六边形内切安全半径
  minY: 2.5,
  maxY: 8.1
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

export function createFishSchool() {
  const geometry = makeFishShape();
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    vertexColors: false,
    transparent: true,
    opacity: 0.96
  });

  const mesh = new THREE.InstancedMesh(geometry, material, FISH_COUNT);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;

  // 每条鱼的状态
  const positions = new Float32Array(FISH_COUNT * 3);
  const velocities = new Float32Array(FISH_COUNT * 3);
  const scales = new Float32Array(FISH_COUNT);
  const wigglePhase = new Float32Array(FISH_COUNT);

  const color = new THREE.Color();
  for (let i = 0; i < FISH_COUNT; i++) {
    // 出生在水体内随机位置
    const r = Math.sqrt(Math.random()) * BOUND.r * 0.9;
    const a = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = rand(BOUND.minY + 0.3, BOUND.maxY - 0.3);
    positions[i * 3 + 2] = Math.sin(a) * r;

    const va = Math.random() * Math.PI * 2;
    velocities[i * 3] = Math.cos(va);
    velocities[i * 3 + 1] = rand(-0.15, 0.15);
    velocities[i * 3 + 2] = Math.sin(va);

    scales[i] = rand(0.28, 0.72);
    wigglePhase[i] = Math.random() * Math.PI * 2;

    color.setHex(PALETTE[(Math.random() * PALETTE.length) | 0]);
    // 亮度随机微调，增加层次
    const l = rand(0.82, 1.08);
    color.r = Math.min(1, color.r * l);
    color.g = Math.min(1, color.g * l);
    color.b = Math.min(1, color.b * l);
    mesh.setColorAt(i, color);
  }
  mesh.instanceColor.needsUpdate = true;

  // 群体吸引点：沿 Lissajous 轨迹在水体内缓慢游走
  const attractor = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const vel = new THREE.Vector3();
  const dirV = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const lookM = new THREE.Matrix4();

  function update(t, dt) {
    // 吸引点轨迹（限制在水体内）
    attractor.set(
      Math.sin(t * 0.13) * BOUND.r * 0.55 + Math.sin(t * 0.31) * 0.8,
      5.2 + Math.sin(t * 0.21) * 2.2,
      Math.cos(t * 0.17) * BOUND.r * 0.55 + Math.cos(t * 0.27) * 0.8
    );

    const dtc = Math.min(dt, 0.05);
    for (let i = 0; i < FISH_COUNT; i++) {
      const ix = i * 3;
      let px = positions[ix], py = positions[ix + 1], pz = positions[ix + 2];
      let vx = velocities[ix], vy = velocities[ix + 1], vz = velocities[ix + 2];

      // 朝向吸引点的群体引力（权重随机分层，形成时聚时散）
      const pull = 0.4 + 0.6 * Math.sin(i * 12.9898);
      const ax = (attractor.x - px) * pull * 0.22;
      const ay = (attractor.y - py) * pull * 0.22;
      const az = (attractor.z - pz) * pull * 0.22;

      // 个体噪声扰动（不同频率叠加，模拟乱流）
      const n1 = Math.sin(t * 1.7 + wigglePhase[i] + py * 0.9);
      const n2 = Math.cos(t * 1.3 + wigglePhase[i] * 1.7 + px * 0.7);
      vx += (ax + n1 * 0.55) * dtc;
      vy += (ay + Math.sin(t * 0.9 + wigglePhase[i]) * 0.25) * dtc;
      vz += (az + n2 * 0.55) * dtc;

      // 限速
      const sp2 = vx * vx + vy * vy + vz * vz;
      const maxSp = 1.6 + scales[i] * 0.5;
      if (sp2 > maxSp * maxSp) {
        const k = maxSp / Math.sqrt(sp2);
        vx *= k; vy *= k; vz *= k;
      }

      px += vx * dtc * 2.0;
      py += vy * dtc * 2.0;
      pz += vz * dtc * 2.0;

      // 边界：六棱柱内切半径 + 高度，越界反弹
      const radial = Math.sqrt(px * px + pz * pz);
      if (radial > BOUND.r) {
        const k = BOUND.r / radial;
        px *= k; pz *= k;
        vx *= -0.8; vz *= -0.8;
      }
      if (py < BOUND.minY) { py = BOUND.minY; vy = Math.abs(vy) * 0.8; }
      if (py > BOUND.maxY) { py = BOUND.maxY; vy = -Math.abs(vy) * 0.8; }

      positions[ix] = px; positions[ix + 1] = py; positions[ix + 2] = pz;
      velocities[ix] = vx; velocities[ix + 1] = vy; velocities[ix + 2] = vz;

      // 朝向速度方向 + 摆尾
      dirV.set(vx, vy, vz);
      if (dirV.lengthSq() < 1e-6) dirV.set(1, 0, 0);
      vel.set(px, py, pz).add(dirV);
      dummy.position.set(px, py, pz);
      lookM.lookAt(dummy.position, vel, up);
      quat.setFromRotationMatrix(lookM);
      dummy.quaternion.copy(quat);
      dummy.rotateY(Math.sin(t * 8.0 + wigglePhase[i]) * 0.18);
      dummy.scale.setScalar(scales[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update };
}
