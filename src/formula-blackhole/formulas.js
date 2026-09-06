import * as THREE from 'three';

// 与参考图风格一致的物理 / 化学 / 数学公式集（Unicode 排版，零依赖）
export const FORMULAS = [
  'Gμν + Λgμν = 8πG/c⁴ · Tμν',
  'Rμν − ½R gμν = 8πG/c⁴ Tμν',
  'rₛ = 2GM/c²',
  'E = mc²',
  'ds² = −(1−rₛ/r)c²dt² + dr²/(1−rₛ/r) + r²dΩ²',
  'S = kc³A / 4Għ',
  'T_H = ħc³ / (8πGMk_B)',
  'iħ ∂ψ/∂t = Ĥψ',
  'Ĥ|ψₙ⟩ = Eₙ|ψₙ⟩',
  '∇·E = ρ/ε₀',
  '∇·B = 0',
  '∇×E = −∂B/∂t',
  '∇×B = μ₀J + μ₀ε₀ ∂E/∂t',
  '∇²φ = 4πGρ',
  '∇²ψ + (2m/ħ²)(E−V)ψ = 0',
  'Δx·Δp ≥ ħ/2',
  'λ = h/p',
  'E = hν',
  'eⁱπ + 1 = 0',
  'eⁱθ = cosθ + i·sinθ',
  '∂ρ/∂t + ∇·(ρv) = 0',
  'F = Gm₁m₂/r²',
  'L = T − V',
  'd/dt(∂L/∂q̇) − ∂L/∂q = 0',
  '∮ B·dl = μ₀(I + ε₀ dΦ/dt)',
  'PV = nRT',
  'ΔG° = −RT ln K',
  'E = E° − (RT/nF) ln Q',
  'N₂ + 3H₂ ⇌ 2NH₃',
  'CO₂ + H₂O ⇌ H₂CO₃',
  'det(A − λI) = 0',
  'H = −Σ pᵢ ln pᵢ',
  'Ωk + ΩΛ + Ωm = 1',
  'Λ ≈ 10⁻⁵² m⁻²',
];

const cache = new Map();

/**
 * 把一条公式渲染成带柔光的 CanvasTexture
 * @returns {{ texture: THREE.CanvasTexture, aspect: number }}
 */
export function createFormulaTexture(text, fontSize = 64) {
  const key = text + '|' + fontSize;
  if (cache.has(key)) return cache.get(key);

  const pad = fontSize * 0.7;
  const probe = document.createElement('canvas').getContext('2d');
  const font = `italic ${fontSize}px "Times New Roman", "Cambria Math", Georgia, serif`;
  probe.font = font;

  const w = Math.ceil(probe.measureText(text).width) + pad * 2;
  const h = Math.ceil(fontSize * 1.9);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 两遍绘制：第一遍做金色柔光，第二遍做清晰字芯
  ctx.shadowColor = 'rgba(255, 196, 110, 0.9)';
  ctx.shadowBlur = fontSize * 0.38;
  ctx.fillStyle = '#fff3dd';
  ctx.fillText(text, w / 2, h / 2);
  ctx.fillText(text, w / 2, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const result = { texture, aspect: w / h };
  cache.set(key, result);
  return result;
}
