// 草原场景 · 草地系统
//  1) 近景：实例化草叶（真实几何），逐叶透光 / 根部自遮挡 / 静态倾斜 + 阵风弯曲
//  2) 远景：圆柱 billboard 草丛卡片（alpha 剪影），随机抖动 LOD 过渡
//  3) 野花：实例化花头
// 全部通过 onBeforeCompile 注入 MeshStandardMaterial → 保留真实阴影与 IBL
import * as THREE from 'three';
import { mulberry32, fbm2, clamp, smoothstep } from './noise.js';
import { terrainHeight, pathDistance, isBare } from './terrain.js';
import { grassTuftTexture } from './textures.js';

/* ----------------------------- GLSL 公共片段 ----------------------------- */
const GLSL_UTIL = /* glsl */ `
float mdHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float mdNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = mdHash(i), b = mdHash(i + vec2(1.0, 0.0));
  float c = mdHash(i + vec2(0.0, 1.0)), d = mdHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec3 mdRotAxis(vec3 v, vec3 axis, float ang){
  float c = cos(ang), s = sin(ang);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}
`;

/** 风场：大尺度阵风沿主风向传播 + 逐叶抖动 */
const WIND_FN = /* glsl */ `
vec2 mdWind(vec2 wp, float phase){
  float t = uTime * uWindSpeed;
  float g1 = mdNoise(wp * 0.145 - uWindDir * (t * 0.55));
  float g2 = mdNoise(wp * 0.041 - uWindDir * (t * 0.19) + 41.7);
  float gust = mix(0.34, 1.65, g2);
  float fl = sin(t * 2.6 + phase * 6.2831 + wp.x * 1.15 + wp.y * 0.75);
  float amp = (g1 * gust * 0.85 + 0.20 + 0.09 * fl) * uWindStrength;
  return uWindDir * amp;
}
`;

const WIND_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform vec2  uWindDir;
uniform float uWindStrength;
uniform float uWindSpeed;
`;

/* ============================ 近景草叶 ============================ */

const BLADE_VERT_DECL = /* glsl */ `
attribute float aT;
attribute vec3  aOffset;
attribute vec2  aSize;
attribute vec4  aOrient;   // x:yaw  y:静态倾斜  z:相位  w:干枯度
attribute vec3  aColor;
uniform float uUpBias;
uniform vec3  uBaseTint;
varying float vT;
varying float vDry;
varying vec3  vColor;
varying vec3  vWorldPos;
varying vec3  vNormalW;
`;

const BLADE_FRAG_DECL = /* glsl */ `
uniform vec3  uBaseTint;
uniform vec3  uDryColor;
uniform vec3  uSunDirW;
uniform vec3  uSunColorW;
uniform float uTransStrength;
uniform float uTransPow;
varying float vT;
varying float vDry;
varying vec3  vColor;
varying vec3  vWorldPos;
varying vec3  vNormalW;
`;

/** 单位草叶：y 由 0(根) 到 1(尖)，半宽按 (1 - t^1.6) 收窄 */
function bladeGeometry(segments) {
  const pos = [], nor = [], tArr = [], idx = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const w = 0.5 * (1 - Math.pow(t, 1.6));
    pos.push(-w, t, 0, w, t, 0);
    nor.push(0, 0, 1, 0, 0, 1);
    tArr.push(t, t);
  }
  const tip = segments * 2;
  pos.push(0, 1, 0); nor.push(0, 0, 1); tArr.push(1);
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const la = (segments - 1) * 2;
  idx.push(la, tip, la + 1);

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(tArr, 1));
  geo.setIndex(idx);
  return geo;
}

export function createGrass({ count = 150000, rNear = 30, segments = 5, seed = 991 } = {}) {
  const rnd = mulberry32(seed);
  const aOffset = new Float32Array(count * 3);
  const aSize = new Float32Array(count * 2);
  const aOrient = new Float32Array(count * 4);
  const aColor = new Float32Array(count * 3);

  const cTmp = new THREE.Color();
  const dryColor = new THREE.Color('#b3a061');
  const greenA = new THREE.Color('#5c8a2a');
  const greenB = new THREE.Color('#84a944');
  const dark = new THREE.Color('#38521a');

  let i = 0, guard = 0;
  while (i < count && guard < count * 26) {
    guard++;
    // 密度 ∝ r^-2.3 的径向分布：近处极密，远处靠卡片接管
    const r = rNear * Math.pow(rnd(), 1.32);
    const a = rnd() * Math.PI * 2;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (isBare(cx, cz)) continue;

    const tuft = 2 + Math.floor(rnd() * 5);
    const tuftR = 0.05 + rnd() * 0.1;
    const fert = fbm2(cx * 0.055 + 11, cz * 0.055 - 3, 4);
    const patch = fbm2(cx * 0.021 - 6, cz * 0.021 + 18, 3);
    const dryBase = clamp((patch - 0.16) * 2.0 + (fert - 0.2) * 0.6, 0, 1);
    const nearRoad = 1 - smoothstep(1.0, 3.4, pathDistance(cx, cz));

    for (let k = 0; k < tuft && i < count; k++) {
      const ax = cx + (rnd() - 0.5) * 2 * tuftR;
      const az = cz + (rnd() - 0.5) * 2 * tuftR;
      const y = terrainHeight(ax, az);

      const h = (0.20 + rnd() * 0.26) * (0.82 + fert * 0.35) * (1 - nearRoad * 0.45);
      const w = 0.010 + rnd() * 0.008;

      aOffset[i * 3] = ax;
      aOffset[i * 3 + 1] = y - 0.02;
      aOffset[i * 3 + 2] = az;

      aSize[i * 2] = w;
      aSize[i * 2 + 1] = h;

      aOrient[i * 4] = rnd() * Math.PI * 2;
      aOrient[i * 4 + 1] = 0.10 + rnd() * 0.42;
      aOrient[i * 4 + 2] = rnd();
      aOrient[i * 4 + 3] = clamp(dryBase * (0.5 + rnd() * 0.65) + nearRoad * 0.4, 0, 1);

      const mixed = clamp(0.5 + fert * 1.1, 0, 1);
      cTmp.copy(greenA).lerp(greenB, mixed);
      cTmp.lerp(dark, clamp(-fert * 1.3, 0, 1) * 0.5);
      cTmp.offsetHSL((rnd() - 0.5) * 0.028, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.09);
      cTmp.lerp(dryColor, aOrient[i * 4 + 3] * 0.7);

      aColor[i * 3] = cTmp.r;
      aColor[i * 3 + 1] = cTmp.g;
      aColor[i * 3 + 2] = cTmp.b;
      i++;
    }
  }

  const used = i;
  const geo = bladeGeometry(segments);
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(aOffset.subarray(0, used * 3), 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize.subarray(0, used * 2), 2));
  geo.setAttribute('aOrient', new THREE.InstancedBufferAttribute(aOrient.subarray(0, used * 4), 4));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor.subarray(0, used * 3), 3));
  geo.instanceCount = used;

  const uniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.94, 0.34).normalize() },
    uWindStrength: { value: 0.42 },
    uWindSpeed: { value: 1.0 },
    uUpBias: { value: 0.26 },
    uBaseTint: { value: new THREE.Color('#ffffff') },
    uDryColor: { value: new THREE.Color('#c2ab63') },
    uSunDirW: { value: new THREE.Vector3(0.4, 0.6, 0.4).normalize() },
    uSunColorW: { value: new THREE.Color('#fff0d2') },
    uTransStrength: { value: 0.85 },
    uTransPow: { value: 2.6 },
  };

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.45,
    dithering: true,
  });
  material.customProgramCacheKey = () => 'meadow-grass';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_UTIL}\n${WIND_UNIFORMS}\n${WIND_FN}\n${BLADE_VERT_DECL}`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        #include <beginnormal_vertex>
        {
          float blT = aT;
          float cy = cos(aOrient.x), sy = sin(aOrient.x);

          vec2 wind = mdWind(aOffset.xz, aOrient.z);
          vec2 bendVec = wind + vec2(sy, cy) * aOrient.y;
          float bm = length(bendVec);

          // 弯曲斜率 → 法线绕"叶片宽度轴"旋转；与风向平行时法线不变（弯曲在同平面内）
          vec3 n0 = vec3(sy, 0.0, cy);
          vec3 nW = n0;
          if (bm > 1e-4) {
            vec3 dir3 = vec3(bendVec.x / bm, 0.0, bendVec.y / bm);
            vec3 axis = normalize(cross(vec3(0.0, 1.0, 0.0), n0) + vec3(1e-5));
            float ang = -2.4 * bm * dot(n0, dir3) * blT;
            nW = mdRotAxis(n0, axis, clamp(ang, -1.15, 1.15));
          }
          nW = normalize(mix(nW, vec3(0.0, 1.0, 0.0), uUpBias));

          objectNormal = nW;
          vNormalW  = nW;
          vT        = blT;
          vDry      = aOrient.w;
          vColor    = aColor;
        }
      `)
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        {
          float blT = aT;
          float cy = cos(aOrient.x), sy = sin(aOrient.x);

          vec3 local = position;
          local.x *= aSize.x;
          local.y *= aSize.y;
          local.xz = vec2(cy * local.x + sy * local.z, -sy * local.x + cy * local.z);

          vec2 bendVec = mdWind(aOffset.xz, aOrient.z) + vec2(sy, cy) * aOrient.y;
          vec3 offs = vec3(bendVec.x, 0.0, bendVec.y) * (blT * blT) * aSize.y;

          transformed = aOffset + local + offs;
          vWorldPos = transformed;
        }
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_UTIL}\n${BLADE_FRAG_DECL}`)
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        {
          vec3 gc = vColor * uBaseTint;
          gc *= mix(0.30, 1.24, smoothstep(0.0, 0.85, vT));    // 根部自遮挡 → 尖端受光
          gc = mix(gc, uDryColor, vDry * smoothstep(0.45, 1.0, vT));
          diffuseColor.rgb *= gc;
        }
      `)
      .replace('#include <lights_fragment_begin>', /* glsl */ `
        #include <lights_fragment_begin>
        {
          vec3 Vw = normalize(cameraPosition - vWorldPos);
          // 背光透射：阳光穿过薄叶片（草地真实感的关键）
          // pow 的底数与指数都做保护，避免 pow(0,0) 产生 NaN
          float back = clamp(-dot(uSunDirW, Vw), 0.0, 1.0);
          float trans = pow(max(back, 1e-4), max(uTransPow, 0.25)) * uTransStrength;
          trans *= smoothstep(0.10, 0.92, vT) * (1.0 - vDry * 0.45);
          reflectedLight.directDiffuse += uSunColorW * trans * 2.5 * diffuseColor.rgb;

          // 叶尖蜡质微高光
          vec3 refl = reflect(-uSunDirW, normalize(vNormalW));
          float sheen = pow(clamp(dot(refl, Vw), 0.0, 1.0), 24.0);
          reflectedLight.directSpecular += uSunColorW * sheen * 0.09 * smoothstep(0.35, 1.0, vT);
        }
      `);
  };

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'grass-blades';
  return { mesh, material, uniforms, count: used };
}

/* ============================ 远景草丛卡片 ============================ */

/** 三行四边形：可做二次曲线弯曲 */
function cardGeometry() {
  const pos = [], uv = [], tArr = [], nor = [], idx = [];
  const rows = [0, 0.5, 1];
  for (let r = 0; r < rows.length; r++) {
    const y = rows[r];
    pos.push(-0.5, y, 0, 0.5, y, 0);
    uv.push(0, y, 1, y);
    nor.push(0, 0, 1, 0, 0, 1);
    tArr.push(y, y);
  }
  for (let r = 0; r < rows.length - 1; r++) {
    const a = r * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(tArr, 1));
  geo.setIndex(idx);
  return geo;
}

export function createGrassCards({ count = 16000, rMin = 24, rMax = 96, seed = 7717 } = {}) {
  const rnd = mulberry32(seed);
  const n = count;
  const aOffset = new Float32Array(n * 3);
  const aSize = new Float32Array(n * 3);   // w, h, phase
  const aColor = new Float32Array(n * 3);

  const cTmp = new THREE.Color();
  const greenA = new THREE.Color('#5f8c2c');
  const greenB = new THREE.Color('#8fb04e');
  const dry = new THREE.Color('#a89a5e');

  let i = 0, guard = 0;
  while (i < n && guard < n * 20) {
    guard++;
    const rr = Math.sqrt(rnd() * (rMax * rMax - rMin * rMin) + rMin * rMin);
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (isBare(x, z)) continue;

    const y = terrainHeight(x, z);
    aOffset[i * 3] = x;
    aOffset[i * 3 + 1] = y - 0.05;
    aOffset[i * 3 + 2] = z;

    aSize[i * 3] = 1.1 + rnd() * 1.3;          // 宽度
    aSize[i * 3 + 1] = 0.5 + rnd() * 0.55;     // 高度
    aSize[i * 3 + 2] = rnd();                  // 相位

    const fert = fbm2(x * 0.05 + 11, z * 0.05 - 3, 3);
    cTmp.copy(greenA).lerp(greenB, clamp(0.5 + fert, 0, 1));
    cTmp.lerp(dry, clamp((fert - 0.25) * 1.8, 0, 1) * 0.7);
    cTmp.offsetHSL((rnd() - 0.5) * 0.02, -0.06, (rnd() - 0.5) * 0.08);
    aColor[i * 3] = cTmp.r; aColor[i * 3 + 1] = cTmp.g; aColor[i * 3 + 2] = cTmp.b;
    i++;
  }

  const used = i;
  const geo = cardGeometry();
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(aOffset.subarray(0, used * 3), 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize.subarray(0, used * 3), 3));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor.subarray(0, used * 3), 3));
  geo.instanceCount = used;

  const uniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.94, 0.34).normalize() },
    uWindStrength: { value: 0.42 },
    uWindSpeed: { value: 1.0 },
    uUpBias: { value: 0.6 },
    uFadeNear: { value: 23.0 },
    uFadeFar: { value: 34.0 },
    uFarFade: { value: 88.0 },
    uSunDirW: { value: new THREE.Vector3(0.4, 0.6, 0.4).normalize() },
    uSunColorW: { value: new THREE.Color('#fff0d2') },
    uTransStrength: { value: 0.7 },
    uTransPow: { value: 2.6 },
  };

  const map = grassTuftTexture(512);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map,
    alphaTest: 0.42,
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.5,
    dithering: true,
  });
  material.customProgramCacheKey = () => 'meadow-card';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_UTIL}\n${WIND_UNIFORMS}\n${WIND_FN}
        attribute float aT;
        attribute vec3  aOffset;
        attribute vec3  aSize;
        attribute vec3  aColor;
        uniform float uUpBias;
        varying float vT;
        varying vec3  vColor;
        varying vec3  vWorldPos;
        varying vec3  vNormalW;
      `)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        #include <beginnormal_vertex>
        {
          // 圆柱 billboard：法线在"朝向相机"与"向上"之间折中，保证受光层次
          vec3 camDir = normalize(vec3(cameraPosition.x - aOffset.x, 0.0, cameraPosition.z - aOffset.z) + vec3(1e-5));
          vec3 nW = normalize(mix(camDir, vec3(0.0, 1.0, 0.0), uUpBias));
          objectNormal = nW;
          vNormalW = nW;
          vT = aT;
          vColor = aColor;
        }
      `)
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        {
          // 圆柱 billboard 展开
          vec3 camDir = normalize(vec3(cameraPosition.x - aOffset.x, 0.0, cameraPosition.z - aOffset.z) + vec3(1e-5));
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), camDir));

          vec3 p = aOffset;
          p += right * (position.x * aSize.x);
          p.y += position.y * aSize.y;

          // 与草叶同源的风场：整片倒伏 + 二次弯曲
          vec2 bendVec = mdWind(aOffset.xz, aSize.z) + vec2(camDir.x, camDir.z) * 0.05;
          p.xz += bendVec * (aT * aT) * aSize.y * 0.9;

          transformed = p;
          vWorldPos = p;
        }
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_UTIL}
        uniform vec3 uSunDirW;
        uniform vec3 uSunColorW;
        uniform float uTransStrength;
        uniform float uTransPow;
        uniform float uFadeNear;
        uniform float uFadeFar;
        uniform float uFarFade;
        varying float vT;
        varying vec3  vColor;
        varying vec3  vWorldPos;
        varying vec3  vNormalW;
      `)
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        {
          vec3 gc = vColor;
          gc *= mix(0.34, 1.2, smoothstep(0.0, 0.8, vT));
          diffuseColor.rgb *= gc;

          // LOD 过渡：近端与真实草叶交接、远端交给雾，均用随机抖动避免硬边
          float d = length(vWorldPos.xz);
          float nearFade = smoothstep(uFadeNear, uFadeFar, d);
          if (nearFade < mdHash(gl_FragCoord.xy * 0.61)) discard;
          float farKeep = 1.0 - smoothstep(uFarFade - 18.0, uFarFade + 6.0, d);
          if (farKeep < mdHash(gl_FragCoord.yx * 0.43)) discard;
        }
      `)
      .replace('#include <lights_fragment_begin>', /* glsl */ `
        #include <lights_fragment_begin>
        {
          vec3 Vw = normalize(cameraPosition - vWorldPos);
          // 注意 pow 的底数与指数都要保护：pow(0,0) 在 GLSL 中未定义，会产生 NaN
          float back = clamp(-dot(uSunDirW, Vw), 0.0, 1.0);
          float trans = pow(max(back, 1e-4), max(uTransPow, 0.25)) * uTransStrength * smoothstep(0.05, 0.9, vT);
          reflectedLight.directDiffuse += uSunColorW * trans * 2.0 * diffuseColor.rgb;
        }
      `);
  };

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'grass-cards';
  return { mesh, material, uniforms, count: used };
}

/* ============================== 野花 ============================== */

const FLOWER_TYPES = [
  { petal: '#f7f4e8', center: '#e9b53a' },
  { petal: '#e8c93f', center: '#b07a1f' },
  { petal: '#bb92d8', center: '#e2c25a' },
  { petal: '#f2f0e2', center: '#d9a52c' },
  { petal: '#e2724f', center: '#f0d070' },
];

/** 5 枚花瓣 + 中心圆盘；aPart 区分花瓣(0)/花心(1) */
function flowerGeometry(petals = 5) {
  const pos = [], nor = [], part = [], idx = [];
  let base = 0;
  for (let p = 0; p < petals; p++) {
    const a = (p / petals) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const r0 = 0.17, r1 = 0.52, w = 0.2;
    const pts = [
      [ca * r0 - sa * w, 0.0, sa * r0 + ca * w],
      [ca * r0 + sa * w, 0.0, sa * r0 - ca * w],
      [ca * r1 + sa * w * 0.3, 0.11, sa * r1 - ca * w * 0.3],
      [ca * r1 - sa * w * 0.3, 0.11, sa * r1 + ca * w * 0.3],
    ];
    for (const q of pts) { pos.push(q[0], q[1], q[2]); nor.push(0, 1, 0); part.push(0); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  const seg = 8;
  pos.push(0, 0.06, 0); nor.push(0, 1, 0); part.push(1);
  const cIdx = base; base++;
  for (let s = 0; s < seg; s++) {
    const a = (s / seg) * Math.PI * 2;
    pos.push(Math.cos(a) * 0.18, 0.05, Math.sin(a) * 0.18); nor.push(0, 1, 0); part.push(1);
  }
  for (let s = 0; s < seg; s++) idx.push(cIdx, cIdx + 1 + s, cIdx + 1 + ((s + 1) % seg));

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  geo.setIndex(idx);
  return geo;
}

export function createFlowers({ count = 2600, rNear = 26, seed = 4242 } = {}) {
  const rnd = mulberry32(seed);
  const n = count;
  const aOffset = new Float32Array(n * 3);
  const aSize = new Float32Array(n);
  const aPetal = new Float32Array(n * 3);
  const aCenter = new Float32Array(n * 3);
  const aPhase = new Float32Array(n);
  const cp = new THREE.Color(), cc = new THREE.Color();

  let i = 0, guard = 0;
  while (i < n && guard < n * 20) {
    guard++;
    const r = rNear * Math.pow(rnd(), 0.8);
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (isBare(x, z)) continue;
    const type = FLOWER_TYPES[Math.floor(rnd() * FLOWER_TYPES.length)];
    cp.set(type.petal); cc.set(type.center);
    const j = (rnd() - 0.5) * 0.08;

    aOffset[i * 3] = x;
    aOffset[i * 3 + 1] = terrainHeight(x, z) + 0.2 + rnd() * 0.24;
    aOffset[i * 3 + 2] = z;
    aSize[i] = 0.05 + rnd() * 0.05;
    aPetal[i * 3] = clamp(cp.r + j, 0, 1); aPetal[i * 3 + 1] = clamp(cp.g + j, 0, 1); aPetal[i * 3 + 2] = clamp(cp.b + j, 0, 1);
    aCenter[i * 3] = clamp(cc.r + j, 0, 1); aCenter[i * 3 + 1] = clamp(cc.g + j, 0, 1); aCenter[i * 3 + 2] = clamp(cc.b + j, 0, 1);
    aPhase[i] = rnd();
    i++;
  }
  const used = i;

  const geo = flowerGeometry();
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(aOffset.subarray(0, used * 3), 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize.subarray(0, used), 1));
  geo.setAttribute('aPetal', new THREE.InstancedBufferAttribute(aPetal.subarray(0, used * 3), 3));
  geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(aCenter.subarray(0, used * 3), 3));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase.subarray(0, used), 1));
  geo.instanceCount = used;

  const uniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.94, 0.34).normalize() },
    uWindStrength: { value: 0.42 },
    uWindSpeed: { value: 1.0 },
  };

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.58, metalness: 0.0,
    side: THREE.DoubleSide, envMapIntensity: 0.7, dithering: true,
  });
  material.customProgramCacheKey = () => 'meadow-flower';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_UTIL}\n${WIND_UNIFORMS}\n${WIND_FN}
        attribute float aPart;
        attribute vec3  aOffset;
        attribute float aSize;
        attribute vec3  aPetal;
        attribute vec3  aCenter;
        attribute float aPhase;
        varying float vPart;
        varying vec3  vPetal;
        varying vec3  vCenter;
      `)
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        {
          float cy = cos(aPhase * 6.2831), sy = sin(aPhase * 6.2831);
          vec3 local = position * aSize;
          local.xz = vec2(cy * local.x + sy * local.z, -sy * local.x + cy * local.z);
          vec2 wind = mdWind(aOffset.xz, aPhase);
          transformed = aOffset + local + vec3(wind.x, 0.0, wind.y) * 0.4;
          vPart = aPart;
          vPetal = aPetal;
          vCenter = aCenter;
        }
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vPart;
        varying vec3  vPetal;
        varying vec3  vCenter;
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb *= mix(vPetal, vCenter, vPart);`);
  };

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.name = 'flowers';
  return { mesh, material, uniforms, count: used };
}
