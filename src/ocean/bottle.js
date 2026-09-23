// 漂流瓶：LatheGeometry 玻璃瓶身（物理透射材质）+ 软木塞 + 瓶中信
// 随波浮沉：JS 采样与着色器一致的 Gerstner 波高/法线
import * as THREE from 'three';

const _up = new THREE.Vector3(0, 1, 0);
const _tiltAxis = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _n = new THREE.Vector3();

export function createBottle() {
  const group = new THREE.Group();

  // 瓶身剖面（单位: 米，长约 0.36）
  const profile = [
    [0.001, 0.000], [0.055, 0.000], [0.075, 0.008], [0.082, 0.025],
    [0.085, 0.060], [0.085, 0.150], [0.078, 0.185], [0.062, 0.215],
    [0.042, 0.245], [0.032, 0.275], [0.030, 0.320], [0.030, 0.335],
    [0.037, 0.340], [0.037, 0.358], [0.030, 0.362], [0.001, 0.362],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#9fd4b4'),
    metalness: 0,
    roughness: 0.05,
    transmission: 1.0,
    thickness: 0.02,
    ior: 1.5,
    attenuationColor: new THREE.Color('#3e8e5e'),
    attenuationDistance: 0.35,
    envMapIntensity: 1.2,
    specularIntensity: 1.0,
  });
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), glassMat);
  group.add(body);

  // 软木塞
  const corkMat = new THREE.MeshStandardMaterial({ color: '#b98d5a', roughness: 0.9 });
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.055, 24), corkMat);
  cork.position.y = 0.375;
  group.add(cork);

  // 瓶中信（卷起的纸，透过玻璃隐约可见）
  const paperMat = new THREE.MeshStandardMaterial({
    color: '#e8dcc0', roughness: 0.85, side: THREE.DoubleSide,
  });
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 16, 1, true), paperMat);
  paper.position.set(0.008, 0.1, 0.005);
  paper.rotation.z = 0.12;
  group.add(paper);

  group.scale.setScalar(10); // 放大便于观察（面板可调）

  const state = {
    group,
    glassMat,
    pos: new THREE.Vector3(6, 0, 4),
    yaw: Math.random() * Math.PI * 2,
    bound: 70,
    driftDir: new THREE.Vector2(0.8, 0.6).normalize(),

    respawn() {
      const a = Math.random() * Math.PI * 2;
      this.pos.set(Math.cos(a) * 40, 0, Math.sin(a) * 40);
      this.yaw = Math.random() * Math.PI * 2;
    },

    update(t, dt, sampler, p) {
      // 漂流：主方向 + 缓慢蛇形
      const meander = Math.sin(t * 0.21) * 0.4;
      const vx = this.driftDir.x + -this.driftDir.y * meander;
      const vz = this.driftDir.y + this.driftDir.x * meander;
      this.pos.x += vx * p.driftSpeed * dt;
      this.pos.z += vz * p.driftSpeed * dt;

      // 漂出边界后从另一侧漂回
      const r = Math.hypot(this.pos.x, this.pos.z);
      if (r > this.bound) {
        const s = (-this.bound * 0.92) / r;
        this.pos.x *= s;
        this.pos.z *= s;
      }

      // 浮沉：波高 + 轻微惯性滞后感
      const y = sampler.height(this.pos.x, this.pos.z, t);
      const targetY = y - p.floatOffset + Math.sin(t * 1.35) * 0.008;
      group.position.y += (targetY - group.position.y) * Math.min(1, dt * 6);
      group.position.x = this.pos.x;
      group.position.z = this.pos.z;

      // 随浪倾斜：把波面法线按 tiltInfluence 混入世界竖直方向
      sampler.normal(this.pos.x, this.pos.z, t, _n);
      _tiltAxis.set(0, 1, 0).lerp(_n, p.tiltInfluence).normalize();
      _q1.setFromUnitVectors(_up, _tiltAxis);

      // 缓慢打转
      this.yaw += dt * 0.06 * p.sway;
      _q2.setFromEuler(_e.set(0, this.yaw, 0));

      // 横躺 + 摇摆
      const lay = Math.PI / 2 + Math.sin(t * 0.62) * 0.07 * p.sway;
      const roll = Math.sin(t * 0.47 + 1.3) * 0.06 * p.sway;
      _q3.setFromEuler(_e.set(lay, 0, roll));

      group.quaternion.copy(_q1).multiply(_q2).multiply(_q3);
    },
  };

  return state;
}
