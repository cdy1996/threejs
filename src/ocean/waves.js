// 真实海面 —— Gerstner 波（GPU Gems 第一章模型）
// 顶点着色器与 JS 采样共用同一份波定义，保证瓶子浮沉与波形严格同步。
import * as THREE from 'three';

// 每个波: 方向(未归一化)、陡峭度 steep(0~1)、波长(米)、初始相位
// 宽频谱 + 分散方向 + 随机相位，避免规则平行的波峰列
export const WAVES = [
  { dir: [1.0, 0.15],   steep: 0.200, len: 64.0, phase: 0.0 },
  { dir: [0.72, -0.69], steep: 0.180, len: 41.0, phase: 1.7 },
  { dir: [-0.42, 0.91], steep: 0.160, len: 27.0, phase: 3.9 },
  { dir: [0.31, 0.95],  steep: 0.150, len: 17.0, phase: 2.4 },
  { dir: [-0.88, -0.47],steep: 0.130, len: 11.0, phase: 5.1 },
  { dir: [0.59, -0.81], steep: 0.120, len: 7.3,  phase: 0.9 },
  { dir: [-0.17, -0.99],steep: 0.105, len: 4.9,  phase: 4.2 },
  { dir: [0.97, 0.24],  steep: 0.090, len: 3.3,  phase: 2.8 },
  { dir: [-0.62, 0.78], steep: 0.080, len: 2.2,  phase: 5.8 },
  { dir: [0.14, -0.99], steep: 0.070, len: 1.5,  phase: 1.2 },
];

// 生成注入到顶点着色器的波叠加代码（波参数烘焙为常量，全局缩放走 uniform）
export function waveCallsGLSL() {
  return WAVES.map((w) => {
    const l = Math.hypot(w.dir[0], w.dir[1]);
    const dx = (w.dir[0] / l).toFixed(5);
    const dz = (w.dir[1] / l).toFixed(5);
    return `  disp += gerstner(vec2(${dx}, ${dz}), ${w.steep.toFixed(4)}, ${w.len.toFixed(2)}, ${w.phase.toFixed(2)}, p, uTime, tang, binorm);`;
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
    const f = k * (rx * x + rz * z - c * t) + w.phase;
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
