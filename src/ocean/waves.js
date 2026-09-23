// 真实海面 —— Gerstner 波（GPU Gems 第一章模型）
// 顶点着色器与 JS 采样共用同一份波定义，保证瓶子浮沉与波形严格同步。
import * as THREE from 'three';

// 每个波: 方向(未归一化)、陡峭度 steep(0~1)、波长(米)
export const WAVES = [
  { dir: [1.0, 0.25],  steep: 0.240, len: 64.0 },
  { dir: [0.85, -0.6], steep: 0.215, len: 33.0 },
  { dir: [-0.35, 0.9], steep: 0.185, len: 19.0 },
  { dir: [0.2, 1.0],   steep: 0.165, len: 11.5 },
  { dir: [-0.9, -0.3], steep: 0.140, len: 7.0 },
  { dir: [0.55, -0.8], steep: 0.115, len: 4.6 },
];

// 生成注入到顶点着色器的波叠加代码（波参数烘焙为常量，全局缩放走 uniform）
export function waveCallsGLSL() {
  return WAVES.map((w) => {
    const l = Math.hypot(w.dir[0], w.dir[1]);
    const dx = (w.dir[0] / l).toFixed(5);
    const dz = (w.dir[1] / l).toFixed(5);
    return `  disp += gerstner(vec2(${dx}, ${dz}), ${w.steep.toFixed(4)}, ${w.len.toFixed(2)}, p, uTime, tang, binorm);`;
  }).join('\n');
}

// JS 侧波高采样（与着色器公式一致；忽略水平位移，对漂浮物足够精确）
export function sampleHeight(x, z, t, p) {
  const ca = Math.cos(p.dirAngle);
  const sa = Math.sin(p.dirAngle);
  let y = 0;
  for (const w of WAVES) {
    const l = Math.hypot(w.dir[0], w.dir[1]);
    const dx = w.dir[0] / l;
    const dz = w.dir[1] / l;
    const rx = dx * ca - dz * sa;
    const rz = dx * sa + dz * ca;
    const k = (2 * Math.PI) / w.len;
    const c = Math.sqrt(9.81 / k) * p.speed;
    const a = (w.steep * p.amplitude) / k;
    const f = k * (rx * x + rz * z - c * t);
    y += a * Math.sin(f);
  }
  return y;
}

const _out = new THREE.Vector3();

// 有限差分求波面法线（用于瓶子随浪倾斜）
export function sampleNormal(x, z, t, p, out = _out) {
  const e = 0.4;
  const hL = sampleHeight(x - e, z, t, p);
  const hR = sampleHeight(x + e, z, t, p);
  const hD = sampleHeight(x, z - e, t, p);
  const hU = sampleHeight(x, z + e, t, p);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}
