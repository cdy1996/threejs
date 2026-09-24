// 草原场景 · 轻量确定性噪声工具（CPU 侧：地形高度 / 程序化贴图）
// 同时提供可平铺（tileable）版本，供贴图使用，避免接缝

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

const P = new Uint8Array(512);
const GRAD = new Float32Array([
  1, 0, -1, 0, 0, 1, 0, -1,
  0.7071, 0.7071, -0.7071, 0.7071, 0.7071, -0.7071, -0.7071, -0.7071
]);

(function initPerm() {
  const rnd = mulberry32(20260923);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
})();

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (hash, x, y) => {
  const h = (hash & 7) << 1;
  return GRAD[h] * x + GRAD[h + 1] * y;
};

/** 经典 2D 梯度噪声，返回约 [-1, 1] */
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const X = xi & 255, Y = yi & 255;
  const n00 = grad(P[P[X] + Y], xf, yf);
  const n10 = grad(P[P[X + 1] + Y], xf - 1, yf);
  const n01 = grad(P[P[X] + Y + 1], xf, yf - 1);
  const n11 = grad(P[P[X + 1] + Y + 1], xf - 1, yf - 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

/** 周期性（可平铺）2D 噪声，period 为整数格点周期（<= 256） */
export function pnoise2(x, y, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const p = period | 0;
  const X = ((xi % p) + p) % p, Y = ((yi % p) + p) % p;
  const X1 = (X + 1) % p, Y1 = (Y + 1) % p;
  const n00 = grad(P[P[X] + Y], xf, yf);
  const n10 = grad(P[P[X1] + Y], xf - 1, yf);
  const n01 = grad(P[P[X] + Y1], xf, yf - 1);
  const n11 = grad(P[P[X1] + Y1], xf - 1, yf - 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

/** 分形叠加（fbm） */
export function fbm2(x, y, oct = 4, lac = 2.0, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    n += a;
    a *= gain; f *= lac;
  }
  return s / n;
}

/** 可平铺 fbm */
export function pfbm2(x, y, period, oct = 4, lac = 2.0, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0, p = period;
  for (let i = 0; i < oct; i++) {
    s += a * pnoise2(x * f, y * f, Math.max(2, Math.round(p)));
    n += a;
    a *= gain; f *= lac; p *= lac;
  }
  return s / n;
}

/** 脊状噪声，用于沟壑 / 木纹 */
export function ridged2(x, y, oct = 4) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(noise2(x * f, y * f));
    s += a * v * v;
    n += a;
    a *= 0.5; f *= 2;
  }
  return s / n;
}

/** 可平铺脊状噪声 */
export function prided2(x, y, period, oct = 4) {
  let a = 1, f = 1, s = 0, n = 0, p = period;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(pnoise2(x * f, y * f, Math.max(2, Math.round(p))));
    s += a * v * v;
    n += a;
    a *= 0.5; f *= 2; p *= 2;
  }
  return s / n;
}
