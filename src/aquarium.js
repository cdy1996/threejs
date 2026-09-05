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
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vWave;

  void main() {
    vec3 V = normalize(cameraPosition - vWorldPos);
    float crest = smoothstep(0.2, 1.0, vWave);

    vec3 col;
    float alpha;
    if (gl_FrontFacing) {
      // ---------- 水面上方视角 ----------
      vec3 n = normalize(vNormal);
      // 太阳漫反射：背光坡面压暗，迎光坡面提亮 → 俯视有明暗起伏
      float ndl = max(dot(n, uSunDir), 0.0);
      col = mix(uDeepColor, uShallowColor, 0.55 + crest * 0.45);
      col *= mix(0.68, 1.22, ndl);
      // 菲涅尔天空反射（掠射角）
      float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
      col = mix(col, uSkyColor, fres * 0.7);
      // 太阳镜面高光
      vec3 R = reflect(-V, n);
      float spec = pow(max(dot(R, uSunDir), 0.0), 160.0);
      float specWide = pow(max(dot(R, uSunDir), 0.0), 24.0);
      col += vec3(1.0, 0.97, 0.88) * (spec * 1.5 + specWide * 0.16);
      alpha = 0.62 + fres * 0.3;
    } else {
      // ---------- 水下仰视视角：通透水色，不发白 ----------
      vec3 n = normalize(-vNormal); // 翻转法线
      float ndl = max(dot(n, uSunDir), 0.0);
      col = mix(uDeepColor * 0.9, uShallowColor, 0.3 + crest * 0.25);
      col *= mix(0.82, 1.05, ndl);
      alpha = 0.5;
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
      uRadius: { value: TANK.waterRadius }
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
