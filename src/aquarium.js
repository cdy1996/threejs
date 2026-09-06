import * as THREE from 'three';
import { TANK, COLORS } from './utils.js';

/**
 * 圆形水模型：
 * - 水体：圆柱侧面（顶部略微上延，避免波浪时露缝）
 * - 水面：细分圆盘，真实感着色——菲涅尔天空反射 + 太阳高光 + 解析法线波浪
 * 半透明物体统一后渲染：水体 renderOrder=10，水面 renderOrder=12
 */

const waterVertex = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const waterFragment = /* glsl */ `
  uniform vec3 uShallowColor;
  uniform vec3 uDeepColor;
  uniform float uWaterTopY;
  uniform float uWaterBottomY;
  uniform float uUnderwater;
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    float depth = clamp((uWaterTopY - vWorldPos.y) / (uWaterTopY - uWaterBottomY), 0.0, 1.0);
    vec3 col = mix(uShallowColor, uDeepColor, pow(depth, 1.35));

    float band = sin(vWorldPos.y * 6.0 - uTime * 1.4 + vWorldPos.x * 1.5) * 0.5 + 0.5;
    col += vec3(0.05, 0.09, 0.08) * band * (1.0 - depth);

    float facing = max(dot(vWorldNormal, vec3(0.0, 0.0, 1.0)), 0.25);
    float alpha = mix(0.16 + depth * 0.28, 0.55 + depth * 0.25, uUnderwater);
    alpha *= mix(1.0, facing, 0.5);
    if (!gl_FrontFacing) {
      col = mix(col, uDeepColor, 0.7);
      alpha = max(alpha, mix(0.18, 0.62, uUnderwater));
    }
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
  }
`;

// 波浪参数：方向 vec2、波数 k、振幅 a、角速度 w（与顶点代码保持一致）
const surfaceVertex = /* glsl */ `
  uniform float uTime;
  uniform float uWaveAmp;
  uniform float uRadius;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vWave;

  void main() {
    vec4 world0 = modelMatrix * vec4(position, 1.0);
    vec2 p = world0.xz;

    // 边缘仅衰减 30% 波幅（保持起伏感），水柱上沿加高遮住接缝
    float rr = length(p) / uRadius;
    float damp = 1.0 - smoothstep(0.72, 0.995, rr) * 0.3;

    // 四组方向正弦波：高度 + 解析偏导（用于法线）
    float h = 0.0;
    vec2 grad = vec2(0.0);
    #define WAVE(dx, dy, k, a, w) \
    { \
      vec2 d = normalize(vec2(dx, dy)); \
      float ph = dot(d, p) * k - uTime * w; \
      h += a * sin(ph); \
      grad += d * (a * k * cos(ph)); \
    }
    WAVE( 1.0,  0.45, 0.95, 0.50, 1.15)
    WAVE(-0.35, 1.0 , 1.30, 0.32, 0.90)
    WAVE( 0.8, -0.7 , 2.10, 0.16, 1.60)
    WAVE(-0.6, -0.8 , 3.10, 0.09, 2.10)
    #undef WAVE

    // 中心涟漪（同心扩散）
    float rlen = length(p);
    float phr = rlen * 1.4 - uTime * 1.7;
    h += 0.14 * sin(phr);
    grad += normalize(p + 0.0001) * (0.14 * 1.4 * cos(phr));

    h *= damp * uWaveAmp;
    grad *= damp * uWaveAmp;

    world0.y += h;
    vWave = h / max(uWaveAmp, 0.001);
    vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
    vWorldPos = world0.xyz;
    gl_Position = projectionMatrix * viewMatrix * world0;
  }
`;

const surfaceFragment = /* glsl */ `
  uniform vec3 uShallowColor;
  uniform vec3 uDeepColor;
  uniform vec3 uSkyColor;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uRadius;
  uniform float uWaterTopY;
  uniform float uFoamOn;
  uniform float uFoamStrength;
  uniform float uFoamScale;
  uniform float uFoamEdge;
  uniform float uFoamWake;
  uniform vec2 uBoatPos;
  uniform vec2 uBoatDir;
  uniform float uBoatScale;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vWave;

  // ---- 卡通厚泡沫噪声：value noise fbm，团块大、边缘圆润 ----
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
      mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.55;
    for (int i = 0; i < 3; i++) {
      s += a * vnoise(p);
      p = p * 2.17 + 19.19;
      a *= 0.5;
    }
    return s;
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorldPos);
    float crest = smoothstep(0.2, 1.0, vWave);

    vec3 col;
    float alpha;
    if (gl_FrontFacing) {
      // ---------- 水面上方视角 ----------
      vec3 n = normalize(vNormal);
      vec2 p = vWorldPos.xz;

      // 大尺度水色斑驳（深浅水团缓慢漂移，参考图的青绿渐变）
      float waterPatch = fbm(p * 0.35 + vec2(uTime * 0.03, -uTime * 0.02));

      // 太阳漫反射：背光坡面压暗，迎光坡面提亮
      float ndl = max(dot(n, uSunDir), 0.0);
      col = mix(uDeepColor, uShallowColor, 0.45 + crest * 0.4);
      col = mix(col, col * 1.3 + uShallowColor * 0.12, waterPatch * 0.55);
      col *= mix(0.72, 1.2, ndl);

      // 波峰透光（SSS 近似）：朝太阳方向看浪尖，透出亮青绿
      float sss = pow(max(dot(V, normalize(uSunDir + vec3(0.0, 0.35, 0.0))), 0.0), 3.0);
      col += vec3(0.30, 0.85, 0.62) * sss * smoothstep(0.1, 1.0, vWave) * 0.65;

      // 菲涅尔天空反射（掠射角）
      float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
      col = mix(col, uSkyColor, fres * 0.7);
      // 太阳镜面高光
      vec3 R = reflect(-V, n);
      float spec = pow(max(dot(R, uSunDir), 0.0), 160.0);
      float specWide = pow(max(dot(R, uSunDir), 0.0), 24.0);
      col += vec3(1.0, 0.97, 0.88) * (spec * 1.5 + specWide * 0.16);
      alpha = 0.62 + fres * 0.3;

      // ---------- 卡通厚泡沫：低频大团块 + 窄过渡硬边 + 细节噪声咬边（沸腾感） ----------
      if (uFoamOn > 0.5) {
        float t = uTime;
        // 沿 X 拉长采样 → 条状浪沫（参考图的波峰泡沫条纹形态）
        vec2 ps = vec2(p.x * 0.45, p.y);
        // 大尺度形状场（决定"哪里有大团"）+ 细节噪声（只负责腐蚀边缘）
        float shapeN = fbm(ps * uFoamScale + vec2(t * 0.08, -t * 0.05));
        float detailN = fbm(ps * uFoamScale * 3.1 - vec2(t * 0.12, t * 0.09) + 7.3);

        // 1) 波峰泡沫：浪尖处连片条状白沫
        float crestM = smoothstep(0.45, 0.9, vWave) + (1.0 - n.y) * 1.3;
        float field1 = shapeN + crestM * 0.6 + (detailN - 0.5) * 0.35;
        float f1 = smoothstep(0.66, 0.75, field1);

        // 2) 边缘泡沫：厚实环带，内缘被圆齿 + 噪声咬出起伏
        float rr = length(p) / uRadius;
        float scallop = 0.85 + 0.15 * sin(atan(p.x, p.y) * 8.0 + t * 0.6 + shapeN * 5.0);
        float inner = 1.0 - uFoamEdge * scallop;
        float f2 = smoothstep(inner, inner + 0.05, rr);

        // 3) 船尾尾迹：V 形扩散条带 + 船身周围湍流白沫，细节噪声咬边
        vec2 d = p - uBoatPos;
        float lx = dot(d, uBoatDir);
        float lz = dot(d, vec2(-uBoatDir.y, uBoatDir.x));
        float behind = smoothstep(0.6, -0.4, lx);
        float spread = (-lx) * 0.55 + 0.35;
        float vband = exp(-pow(abs(lz) - spread * 0.75, 2.0) * 8.0);
        float nearPatch = smoothstep(1.6 * uBoatScale, 0.2, length(d));
        float distFade = smoothstep(5.0, 1.2, length(d));
        float f3 = (vband + nearPatch * 0.9) * behind * distFade * uBoatScale;
        f3 *= smoothstep(0.55, 0.65, shapeN + (detailN - 0.5) * 0.4 + nearPatch * 0.5);

        float foam = clamp(f1 + max(f2, f3 * uFoamWake), 0.0, 1.0) * uFoamStrength;
        foam = clamp(foam, 0.0, 1.0);

        // 厚泡沫：接近纯白的团块，团内按形状噪声留一点水色阴影
        vec3 foamCol = vec3(0.99, 0.99, 0.97) * (0.9 + 0.1 * shapeN);
        col = mix(col, foamCol, foam * 0.95);
        alpha = mix(alpha, 0.95, foam * 0.9);
      }
    } else {
      // ---------- 水下仰视视角（参考图：深蓝环境 + 太阳亮斑光晕 + 波面透光斑驳） ----------
      vec3 n = normalize(-vNormal); // 翻转法线
      float ndl = max(dot(n, uSunDir), 0.0);

      // 深水基色：深蓝（线性值直接写，sRGB 输出后为中深蓝），波面斜度带来明暗
      vec3 deepBlue = vec3(0.010, 0.060, 0.100);
      vec3 litBlue  = vec3(0.030, 0.150, 0.220);
      col = mix(deepBlue, litBlue, ndl * 0.7 + 0.3);

      // 大尺度透光斑驳（波面折射的明暗斑块，缓慢漂移）
      float mottle = fbm(vWorldPos.xz * 0.9 + vec2(uTime * 0.06, -uTime * 0.045));
      col *= 0.5 + 0.6 * smoothstep(0.3, 0.8, mottle);

      // 浪尖下方透光更亮
      col += vec3(0.08, 0.22, 0.24) * max(vWave, 0.0);

      // 太阳亮斑（小而集中）+ 适度光晕（Snell 窗近似：太阳方向与水面平面的交点）
      vec3 sunSurf = cameraPosition + uSunDir * ((uWaterTopY - cameraPosition.y) / max(uSunDir.y, 0.25));
      float dSun = length(vWorldPos.xz - sunSurf.xz);
      float glow = exp(-dSun * dSun * 1.6) * 1.25 + exp(-dSun * dSun * 0.6) * 0.22;
      col += vec3(1.0, 0.98, 0.9) * glow;

      // 太阳周围的碎亮斑（水面皱褶闪烁），只出现在亮斑附近
      float sparkle = pow(fbm(vWorldPos.xz * 2.2 + vec2(uTime * 0.15, uTime * 0.1)), 3.0) * exp(-dSun * dSun * 0.5);
      col += vec3(1.0) * sparkle * 0.9;

      alpha = 0.6;
    }

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
  }
`;

/**
 * 细分圆盘（XZ 平面，极坐标网格，内部顶点用于波浪起伏）
 */
function makeDiscSurfaceGeometry(radius, rings = 14, segs = 72) {
  const positions = [];
  const indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    const rr = (ring / rings) * radius;
    for (let s = 0; s <= segs; s++) {
      const theta = (s / segs) * Math.PI * 2;
      positions.push(Math.sin(theta) * rr, 0, Math.cos(theta) * rr);
    }
  }
  const stride = segs + 1;
  for (let ring = 0; ring < rings; ring++) {
    for (let s = 0; s < segs; s++) {
      const a = ring * stride + s;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

export function createAquarium() {
  const group = new THREE.Group();

  // ---- 木质底座（圆形） ----
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(TANK.baseRadius, TANK.baseRadius + 0.3, TANK.baseHeight, 56),
    new THREE.MeshToonMaterial({ color: 0x8a5a3b })
  );
  base.position.y = TANK.baseHeight / 2;
  group.add(base);

  // ---- 水体 Volume（圆柱侧面，顶部上延 0.12 贴住波浪） ----
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uShallowColor: { value: new THREE.Color(COLORS.waterShallow) },
      uDeepColor: { value: new THREE.Color(COLORS.waterDeep) },
      uWaterTopY: { value: TANK.waterTopY },
      uWaterBottomY: { value: TANK.waterBottomY },
      uUnderwater: { value: 0 },
      uTime: { value: 0 }
    },
    vertexShader: waterVertex,
    fragmentShader: waterFragment
  });
  const overlap = 0.3; // 水柱上沿高出水面，遮住波浪边缘接缝（边缘波幅保留 70%，最大浪峰 < 0.3）
  const waterH = TANK.waterTopY - TANK.waterBottomY + overlap;
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(TANK.waterRadius, TANK.waterRadius, waterH, 64, 1, true),
    waterMat
  );
  water.position.y = TANK.waterBottomY + waterH / 2 - overlap;
  water.renderOrder = 10;
  group.add(water);

  // ---- 水面（细分圆盘 + 菲涅尔/太阳高光） ----
  const sunDir = new THREE.Vector3(8, 15, 6).normalize();
  const surfaceGeo = makeDiscSurfaceGeometry(TANK.waterRadius * 0.998, 14, 72);
  const surfaceMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uShallowColor: { value: new THREE.Color(COLORS.waterShallow) },
      uDeepColor: { value: new THREE.Color(COLORS.waterDeep) },
      uSkyColor: { value: new THREE.Color(0xbfeae6) },
      uSunDir: { value: sunDir },
      uTime: { value: 0 },
      uWaveAmp: { value: 0.2 },
      uRadius: { value: TANK.waterRadius },
      uWaterTopY: { value: TANK.waterTopY },
      // 泡沫
      uFoamOn: { value: 1 },
      uFoamStrength: { value: 1.0 },
      uFoamScale: { value: 2.6 },
      uFoamEdge: { value: 0.22 },
      uFoamWake: { value: 1.0 },
      uBoatPos: { value: new THREE.Vector2(-1.8, 0.6) },
      uBoatDir: { value: new THREE.Vector2(Math.cos(0.5), -Math.sin(0.5)) },
      uBoatScale: { value: 1.0 }
    },
    vertexShader: surfaceVertex,
    fragmentShader: surfaceFragment
  });
  const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
  surface.position.y = TANK.waterTopY;
  surface.renderOrder = 12;
  group.add(surface);

  return {
    group,
    waterMat,
    surfaceMat,
    update(t) {
      waterMat.uniforms.uTime.value = t;
      surfaceMat.uniforms.uTime.value = t;
    }
  };
}
