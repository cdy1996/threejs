// 草原场景 · 程序化贴图（Canvas2D 生成，无任何外部资源）
import * as THREE from 'three';
import { pfbm2, prided2, pnoise2, clamp, lerp, mulberry32 } from './noise.js';

function canvasTex(size, draw, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function px(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const out = [0, 0, 0, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x, y, out, size);
      const i = (y * size + x) * 4;
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, ctx };
}

function wrapCanvas(size, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  return (canvas, ctx) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
}

const hex = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;

/* ------------------------------------------------------------------ */
/* 地面细节层（土壤 / 苔痕 / 草屑 / 碎石）                              */
/* ------------------------------------------------------------------ */
/**
 * 这是「细节层」，不是「颜色贴图」。
 *
 * three 的 MeshStandardMaterial 最终反照率是 `map × vertexColor`。
 * 若两者各自都是一份完整反照率（都只有 0.1~0.3 量级），相乘后就是 0.02~0.09，
 * 画面立刻变成「近黑的墨绿地面」——这正是之前的病根。
 * 因此这里只输出 **均值 ≈ 1.0 的亮度扰动 + 极轻微色偏**，
 * 地面色相 100% 交给地形顶点色决定。
 *
 * 另外按「线性数据」使用（srgb: false）：若当 sRGB 贴图再解码一次，
 * 0.9 会被解成 0.79，等于凭空又压暗两成。
 */
export function groundTexture(size = 512, repeat = [26, 26], amount = 0.30) {
  const { canvas, ctx } = px(size, (x, y, o, s) => {
    const u = x / s, v = y / s;
    const soil = 0.5 + 0.5 * pfbm2(u * 6, v * 6, 6, 5);   // 大块起伏
    const fine = pfbm2(u * 40, v * 40, 40, 3);            // 细颗粒
    const patch = 0.5 + 0.5 * pfbm2(u * 2.2, v * 2.2, 3, 3);
    const moss = clamp((patch - 0.45) * 2.4, 0, 1);

    // 围绕 1.0 上下浮动的亮度系数（保持均值 1，不改整体明暗，只加质感）
    const k = 1.0 + (soil - 0.5) * amount * 1.7 + fine * amount * 0.75;

    let r = k, g = k, b = k;
    // 苔痕：略偏冷绿
    g *= 1.0 + moss * 0.055; b *= 1.0 - moss * 0.075;
    // 枯草屑：略偏暖
    const clip = pfbm2(u * 120, v * 120, 120, 2);
    if (clip > 0.42) {
      const q = clamp((clip - 0.42) * 2.2, 0, 1);
      r *= 1 + q * 0.115; g *= 1 + q * 0.055; b *= 1 - q * 0.10;
    }
    // 小石子：提亮
    const st = pnoise2(u * 80, v * 80, 80);
    if (st > 0.62) { const q = clamp((st - 0.62) * 3, 0, 1); r += q * 0.22; g += q * 0.22; b += q * 0.205; }

    o[0] = clamp(r * 255, 0, 255);
    o[1] = clamp(g * 255, 0, 255);
    o[2] = clamp(b * 255, 0, 255);
    o[3] = 255;
  });
  return wrapCanvas(size, { repeat, srgb: false })(canvas, ctx);
}

/* ------------------------------------------------------------------ */
/* 木材：板材（墙面 / 门 / 栅栏）                                       */
/* ------------------------------------------------------------------ */
export function woodPlankTexture({
  size = 512,
  repeat = [1, 1],
  base = [132, 96, 60],
  plankCount = 7,
  vertical = false,
  roughness = 0.9,
  knotCount = 5,
  seed = 7,
  colorSpace = THREE.SRGBColorSpace,
} = {}) {
  const rnd = mulberry32(seed);
  const knots = Array.from({ length: knotCount }, () => ({
    u: rnd(), v: rnd(), r: 0.012 + rnd() * 0.018, a: 0.5 + rnd() * 0.5,
  }));

  const { canvas, ctx } = px(size, (x, y, o, s) => {
    // 让板材沿一个方向排列
    const a = vertical ? y / s : x / s;   // 沿板长
    const bb = vertical ? x / s : y / s;  // 跨板宽

    const plank = Math.floor(bb * plankCount);
    const inPlank = bb * plankCount - plank;
    const pr = mulberry32(plank * 131 + seed);

    // 每块板的基色差异
    const tint = 0.86 + pr() * 0.28;
    const grain = prided2(a * 26 + plank * 9, bb * 3.2, 32, 4);
    const fine = pfbm2(a * 90, bb * 14, 128, 3);

    let r = base[0] * tint, g = base[1] * tint, bl = base[2] * tint;
    const gv = (grain - 0.52) * 0.5 + fine * 0.22 + roughness * 0.04;
    r *= 1 + gv; g *= 1 + gv * 0.9; bl *= 1 + gv * 0.8;

    // 木节
    for (const k of knots) {
      const du = (a - k.u) * 6.0, dv = (bb - k.v) * 1.6;
      const d = Math.sqrt(du * du + dv * dv) * 5.5;
      if (d < k.r * 9) {
        const ring = 0.5 + 0.5 * Math.cos(d * 34);
        const falloff = 1 - clamp(d / (k.r * 9), 0, 1);
        r = lerp(r, 62, falloff * 0.85 * k.a * ring);
        g = lerp(g, 44, falloff * 0.85 * k.a * ring);
        bl = lerp(bl, 28, falloff * 0.85 * k.a * ring);
      }
    }

    // 板缝阴影
    const edge = Math.min(inPlank, 1 - inPlank);
    const gap = 1 - clamp(edge / 0.025, 0, 1);
    r *= 1 - gap * 0.72; g *= 1 - gap * 0.72; bl *= 1 - gap * 0.72;

    o[0] = clamp(r, 0, 255); o[1] = clamp(g, 0, 255); o[2] = clamp(bl, 0, 255); o[3] = 255;
  });
  return wrapCanvas(size, { repeat })(canvas, ctx);
}

/* ------------------------------------------------------------------ */
/* 原木 / 树皮                                                          */
/* ------------------------------------------------------------------ */
export function barkTexture({ size = 512, repeat = [1, 1], base = [120, 92, 64], seed = 3 } = {}) {
  const { canvas, ctx } = px(size, (x, y, o, s) => {
    const u = x / s, v = y / s;
    // 沿 v 方向（原木轴）拉长的纵向纹理
    const stress = prided2(u * 10, v * 2.0, 12, 5);
    const fine = prided2(u * 42, v * 6, 48, 3);
    const lum = 0.5 + pfbm2(u * 5, v * 3, 6, 3);

    let k = 0.55 + stress * 0.85 + fine * 0.28 + lum * 0.3;
    let r = base[0] * k, g = base[1] * k, bl = base[2] * k;

    // 深色裂缝
    if (stress < 0.24) {
      const d = (0.24 - stress) * 3.4;
      r *= 1 - d * 0.62; g *= 1 - d * 0.6; bl *= 1 - d * 0.55;
    }
    o[0] = clamp(r, 0, 255); o[1] = clamp(g, 0, 255); o[2] = clamp(bl, 0, 255); o[3] = 255;
  });
  return wrapCanvas(size, { repeat })(canvas, ctx);
}

/* ------------------------------------------------------------------ */
/* 屋顶木瓦（shingle）：一行行错缝叠瓦 + 苔痕                            */
/* ------------------------------------------------------------------ */
export function shingleTexture({ size = 512, repeat = [1, 1], rows = 11, cols = 9, seed = 11 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#2a201a';
  ctx.fillRect(0, 0, size, size);

  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (size / cols) * 0.5;
    for (let i = -1; i <= cols; i++) {
      const x = i * (size / cols) + offset;
      const y = r * rh;
      const t = 0.75 + rnd() * 0.5;
      const base = [104 * t, 78 * t, 58 * t];
      ctx.fillStyle = hex(base[0], base[1], base[2]);
      ctx.fillRect(x, y, size / cols - 1.2, rh - 1.2);
      // 木纹微条
      ctx.globalAlpha = 0.14;
      for (let g = 0; g < 3; g++) {
        ctx.fillStyle = rnd() > 0.5 ? '#000' : '#e8cfa8';
        ctx.fillRect(x + rnd() * (size / cols), y, 1, rh);
      }
      ctx.globalAlpha = 1;
      // 下缘投影
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(x, y + rh - 3.4, size / cols - 1.2, 3.4);
    }
  }
  // 苔痕 / 风化
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const moss = clamp((pfbm2(u * 4, v * 4, 4, 4) - 0.12) * 2.6, 0, 1);
      const weather = 0.82 + 0.36 * pfbm2(u * 9, v * 9, 9, 3);
      const i = (y * size + x) * 4;
      d[i] = clamp(d[i] * weather * (1 - moss * 0.55) + moss * 34, 0, 255);
      d[i + 1] = clamp(d[i + 1] * weather * (1 - moss * 0.3) + moss * 58, 0, 255);
      d[i + 2] = clamp(d[i + 2] * weather + moss * 26, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return wrapCanvas(size, { repeat })(c, ctx);
}

/* ------------------------------------------------------------------ */
/* 石材 / 地基 / 烟囱                                                   */
/* ------------------------------------------------------------------ */
export function stoneTexture({ size = 512, repeat = [1, 1], base = [138, 136, 128], seed = 5 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#4a4842';
  ctx.fillRect(0, 0, size, size);

  const rows = 7;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 40;
    while (x < size) {
      const w = size / (5 + rnd() * 4);
      const t = 0.72 + rnd() * 0.52;
      ctx.fillStyle = hex(base[0] * t, base[1] * t, base[2] * t * 0.98);
      const y = r * rh + (rnd() - 0.5) * 2;
      const pad = 2.0;
      const rr = Math.min(w, rh) * 0.28;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x + pad, y + pad, w - pad * 2, rh - pad * 2, rr);
      else ctx.rect(x + pad, y + pad, w - pad * 2, rh - pad * 2);
      ctx.fill();
      // 石面颗粒
      ctx.globalAlpha = 0.18;
      for (let s = 0; s < 8; s++) {
        ctx.fillStyle = rnd() > 0.5 ? '#ffffff' : '#000000';
        ctx.fillRect(x + rnd() * w, y + rnd() * rh, 2, 2);
      }
      ctx.globalAlpha = 1;
      x += w;
    }
  }
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const n = 0.86 + 0.3 * pfbm2(u * 14, v * 14, 14, 3);
      const moss = clamp((pfbm2(u * 3.5 + 7, v * 3.5, 4, 4) - 0.3) * 2.4, 0, 1);
      const i = (y * size + x) * 4;
      d[i] = clamp(d[i] * n * (1 - moss * 0.5) + moss * 30, 0, 255);
      d[i + 1] = clamp(d[i + 1] * n * (1 - moss * 0.25) + moss * 54, 0, 255);
      d[i + 2] = clamp(d[i + 2] * n + moss * 22, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return wrapCanvas(size, { repeat })(c, ctx);
}

/** 灰度凹凸贴图（噪声），可用于 bumpMap */
export function noiseBump({ size = 512, repeat = [1, 1], freq = 24, oct = 5, contrast = 1.0 } = {}) {
  const { canvas, ctx } = px(size, (x, y, o, s) => {
    const n = 0.5 + 0.5 * pfbm2((x / s) * freq, (y / s) * freq, freq, oct);
    const v = clamp((n - 0.5) * contrast + 0.5, 0, 1) * 255;
    o[0] = o[1] = o[2] = v; o[3] = 255;
  });
  return wrapCanvas(size, { repeat, srgb: false })(canvas, ctx);
}

/* ------------------------------------------------------------------ */
/* 云层：fbm 生成的柔和云团 alpha                                        */
/* ------------------------------------------------------------------ */
export function cloudTexture(size = 1024, seed = 0) {
  const { canvas, ctx } = px(size, (x, y, o, s) => {
    const u = x / s, v = y / s;
    let n = pfbm2(u * 3.0 + seed * 13, v * 3.0, 3, 6, 2.0, 0.55);
    n = 0.5 + 0.5 * n;
    // 垂直方向做地平线附近的透视压缩感
    const band = clamp(1 - Math.abs(v - 0.42) * 1.5, 0, 1);
    let a = clamp((n - 0.46) * 3.2, 0, 1) * band;
    a = a * a * (3 - 2 * a);
    const bright = 0.78 + 0.35 * n;
    o[0] = clamp(255 * bright, 0, 255);
    o[1] = clamp(251 * bright, 0, 255);
    o[2] = clamp(246 * bright, 0, 255);
    o[3] = clamp(a * 255, 0, 255);
    return { a };
  });
  return wrapCanvas(size, { repeat: [1, 1], aniso: 4 })(canvas, ctx);
}

/* ------------------------------------------------------------------ */
/* 光斑（尘埃 / 花粉 / 萤火）                                           */
/* ------------------------------------------------------------------ */
export function moteTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,252,236,1)');
  g.addColorStop(0.25, 'rgba(255,244,206,0.72)');
  g.addColorStop(0.6, 'rgba(255,236,180,0.16)');
  g.addColorStop(1.0, 'rgba(255,230,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------ */
/* 原木截面：年轮 + 径向裂纹                                            */
/* ------------------------------------------------------------------ */
export function woodRingTexture({ size = 256, repeat = [1, 1], base = [198, 166, 116], seed = 21 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  const cx = size / 2, cy = size / 2;
  ctx.fillStyle = hex(base[0], base[1], base[2]);
  ctx.fillRect(0, 0, size, size);

  for (let i = 70; i >= 1; i--) {
    const r = (i / 70) * (size * 0.72);
    const wob = 1 + (rnd() - 0.5) * 0.05;
    ctx.beginPath();
    ctx.arc(cx + (rnd() - 0.5) * 4, cy + (rnd() - 0.5) * 4, r * wob, 0, Math.PI * 2);
    ctx.strokeStyle = i % 2
      ? `rgba(96,68,40,${0.16 + rnd() * 0.2})`
      : `rgba(232,206,158,${0.1 + rnd() * 0.14})`;
    ctx.lineWidth = 1 + rnd() * 2.6;
    ctx.stroke();
  }
  // 径向裂纹
  for (let i = 0; i < 10; i++) {
    const a = rnd() * Math.PI * 2;
    const l = size * (0.16 + rnd() * 0.34);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
    ctx.strokeStyle = `rgba(58,38,22,${0.22 + rnd() * 0.35})`;
    ctx.lineWidth = 0.8 + rnd() * 1.8;
    ctx.stroke();
  }
  // 髓心
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.09);
  g.addColorStop(0, 'rgba(78,52,30,0.85)');
  g.addColorStop(1, 'rgba(78,52,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = 0.9 + 0.2 * pfbm2((x / size) * 20, (y / size) * 20, 20, 3);
      const i = (y * size + x) * 4;
      d[i] = clamp(d[i] * n, 0, 255);
      d[i + 1] = clamp(d[i + 1] * n, 0, 255);
      d[i + 2] = clamp(d[i + 2] * n, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return wrapCanvas(size, { repeat })(c, ctx);
}

/* ------------------------------------------------------------------ */
/* 灰浆 / 填缝（原木之间）                                               */
/* ------------------------------------------------------------------ */
export function plasterTexture({ size = 512, repeat = [1, 1], base = [196, 184, 158], seed = 31 } = {}) {
  const { canvas, ctx } = px(size, (x, y, o, s) => {
    const u = x / s, v = y / s;
    const big = 0.5 + 0.5 * pfbm2(u * 5, v * 5, 5, 4);
    const fine = pfbm2(u * 46, v * 46, 46, 3);
    const crack = prided2(u * 8 + 3, v * 8, 8, 4);
    let k = 0.78 + big * 0.34 + fine * 0.14;
    if (crack > 0.78) k *= 1 - (crack - 0.78) * 2.4;
    o[0] = clamp(base[0] * k, 0, 255);
    o[1] = clamp(base[1] * k, 0, 255);
    o[2] = clamp(base[2] * k, 0, 255);
    o[3] = 255;
  });
  return wrapCanvas(size, { repeat })(canvas, ctx);
}

/* ------------------------------------------------------------------ */
/* 草丛卡片：一簇草叶剪影（alpha 裁切），亮度已烘焙，色相由实例色驱动       */
/* ------------------------------------------------------------------ */
export function grassTuftTexture(size = 512, seed = 88) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);

  const grad = ctx.createLinearGradient(0, size, 0, 0);
  grad.addColorStop(0.0, 'rgb(78,96,62)');
  grad.addColorStop(0.35, 'rgb(128,150,96)');
  grad.addColorStop(0.72, 'rgb(196,214,150)');
  grad.addColorStop(1.0, 'rgb(240,246,208)');

  const blade = (x0, y0, x1, y1, ctrlX, ctrlY, w0) => {
    const N = 9;
    const L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, mt = 1 - t;
      const x = mt * mt * x0 + 2 * mt * t * ctrlX + t * t * x1;
      const y = mt * mt * y0 + 2 * mt * t * ctrlY + t * t * y1;
      const dx = 2 * mt * (ctrlX - x0) + 2 * t * (x1 - ctrlX);
      const dy = 2 * mt * (ctrlY - y0) + 2 * t * (y1 - ctrlY);
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      const w = w0 * Math.pow(1 - t, 0.75) * 0.5;
      L.push([x + nx * w, y + ny * w]);
      R.push([x - nx * w, y - ny * w]);
    }
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (const p of L) ctx.lineTo(p[0], p[1]);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
    ctx.fill();
  };

  // 外层：向外倒伏的长叶
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI * (0.62 - rnd() * 1.24);         // 向上扇形
    const len = size * (0.40 + rnd() * 0.36);
    const x0 = size * (0.5 + (rnd() - 0.5) * 0.22);
    const x1 = x0 + Math.sin(a) * len;
    const y1 = size - Math.cos(a) * len * 0.95;
    const cx = (x0 + x1) / 2 + (rnd() - 0.5) * size * 0.16;
    ctx.fillStyle = grad;
    blade(x0, size, x1, y1, cx, size - len * 0.55, size * (0.028 + rnd() * 0.03));
  }
  // 内层：直立短叶
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI * (0.5 - rnd() * 0.9);
    const len = size * (0.3 + rnd() * 0.32);
    const x0 = size * (0.5 + (rnd() - 0.5) * 0.14);
    const x1 = x0 + Math.sin(a) * len;
    const y1 = size - Math.cos(a) * len;
    ctx.fillStyle = grad;
    blade(x0, size, x1, y1, (x0 + x1) / 2 + (rnd() - 0.5) * size * 0.06, size - len * 0.6, size * (0.03 + rnd() * 0.028));
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------ */
/* 玻璃：轻微的污渍与反光条（用作 roughnessMap）                          */
/* ------------------------------------------------------------------ */
export function glassRoughTexture(size = 256) {
  const { canvas, ctx } = px(size, (x, y, o, s) => {
    const n = 0.5 + 0.5 * pfbm2((x / s) * 8, (y / s) * 8, 8, 4);
    const v = clamp(0.06 + n * 0.16, 0, 1) * 255;
    o[0] = o[1] = o[2] = v; o[3] = 255;
  });
  return wrapCanvas(size, { repeat: [1, 1], srgb: false })(canvas, ctx);
}

export { canvasTex };
