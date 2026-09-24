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
  uniform vec3 uSkyColor;
  uniform float uWaterTopY;
  uniform float uWaterBottomY;
  uniform float uUnderwater;
  uniform float uWaterOpacity;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    float depth = clamp((uWaterTopY - vWorldPos.y) / (uWaterTopY - uWaterBottomY), 0.0, 1.0);
    vec3 col = mix(uShallowColor, uDeepColor, pow(depth, 1.25));

    // 垂直光带：绕柱分布、沿 Y 不变（静态水色深浅）
    float ang = atan(vWorldPos.z, vWorldPos.x);
    float band = sin(ang * 4.0) * 0.5 + 0.5;
    col += vec3(0.04, 0.07, 0.06) * band * (1.0 - depth * 0.7);

    // 菲涅尔：掠射角出现稳定亮边（玻璃感），不再依赖相机方位
    float fres = pow(1.0 - abs(dot(N, V)), 3.0);
    col = mix(col, uSkyColor, fres * 0.5);

    float alpha = mix(0.13 + depth * 0.20, 0.48 + depth * 0.24, uUnderwater);
    alpha = mix(alpha, 0.82, fres * 0.6);
    if (!gl_FrontFacing) {
      col = mix(col, uDeepColor, 0.6);
      alpha = max(alpha, mix(0.15, 0.56, uUnderwater));
    }
    gl_FragColor = vec4(col, clamp(alpha * uWaterOpacity, 0.0, 0.95));
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
  uniform float uOpacity;
  uniform float uUnderAlpha;
  uniform float uFoamOn;
  uniform float uFoamStrength;
  uniform float uFoamScale;
  uniform float uFoamWake;
  uniform vec2 uBoatPos;
  uniform vec2 uBoatDir;
  uniform float uBoatScale;
  // ---- 分层开关（1=开 0=关），供面板逐层对比 ----
  uniform float uLNormOn;
  uniform float uLDiffOn;
  uniform float uLColorOn;
  uniform float uLReliefOn;
  uniform float uLSssOn;
  uniform float uLFresOn;
  uniform float uLSpecOn;
  // 太阳高光可调参数
  uniform float uSpecSharp;
  uniform float uSpecWideSharp;
  uniform float uSpecInt;
  uniform float uSpecWideInt;
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

      // ① 小尺度 noise 扰动法线：打碎正弦法线的周期性高光，形成随机波光
      if (uLNormOn > 0.5) {
        float nx = fbm(p * 3.0 + vec2(uTime * 0.10, uTime * 0.07)) - 0.5;
        float nz = fbm(p * 3.0 - vec2(uTime * 0.08, uTime * 0.09) + 4.7) - 0.5;
        n = normalize(n + vec3(nx, 0.0, nz) * 0.35);
      }

      // ② 太阳漫反射：仅保留轻微坡面明暗
      float ndl = max(dot(n, uSunDir), 0.0);

      // ③ noise 驱动的深浅色块（"模拟海面"的蓝色变化来源，关掉即回到单一水色）
      col = uShallowColor;
      float mottle = 0.5;
      if (uLColorOn > 0.5) {
        mottle = fbm(p * 1.1 + vec2(uTime * 0.055, -uTime * 0.04)) * 0.65
               + fbm(p * 2.4 - vec2(uTime * 0.045, uTime * 0.06) + 7.3) * 0.35;
        col = mix(uDeepColor, uShallowColor, clamp(mottle, 0.0, 1.0));
      }

      // ④ 伪立体光影：亮斑中心提亮、暗斑压暗，让色块"鼓起来"
      if (uLReliefOn > 0.5) {
        col += vec3(0.10, 0.15, 0.13) * smoothstep(0.58, 0.88, mottle);
        col *= 1.0 - 0.20 * smoothstep(0.42, 0.18, mottle);
      }

      // ⑤ 轻微坡面明暗 + 波峰透光（SSS）
      if (uLDiffOn > 0.5) col *= mix(0.88, 1.12, ndl);
      if (uLSssOn > 0.5) {
        float sss = pow(max(dot(V, normalize(uSunDir + vec3(0.0, 0.35, 0.0))), 0.0), 3.0);
        col += vec3(0.30, 0.85, 0.62) * sss * smoothstep(0.3, 1.0, vWave) * 0.35;
      }

      // ⑥ 菲涅尔天空反射（掠射角）
      float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
      if (uLFresOn > 0.5) col = mix(col, uSkyColor, fres * 0.7);

      // ⑦ 太阳镜面高光：白色由光照反射自然产生，靠法线起伏显出水面不平
      if (uLSpecOn > 0.5) {
        vec3 R = reflect(-V, n);
        float spec = pow(max(dot(R, uSunDir), 0.0), uSpecSharp);
        float specWide = pow(max(dot(R, uSunDir), 0.0), uSpecWideSharp);
        col += vec3(1.0, 0.97, 0.88) * (spec * uSpecInt + specWide * uSpecWideInt);
      }
      // 半透明水膜：正视角透出水下的鱼和海底，掠射角反射天空而变实
      alpha = mix(0.55, 0.92, fres) * uOpacity;

      // ---------- 卡通厚泡沫：低频大团块 + 窄过渡硬边 + 细节噪声咬边（沸腾感） ----------
      if (uFoamOn > 0.5) {
        float t = uTime;
        // 轻度拉长采样 → 碎沫点缀 + 轻微流动感
        vec2 ps = p * vec2(0.7, 1.0);
        // 大尺度形状场（决定"哪里有沫"）+ 细节噪声（腐蚀边缘）
        float shapeN = fbm(ps * uFoamScale + vec2(t * 0.08, -t * 0.05));
        float detailN = fbm(ps * uFoamScale * 3.1 - vec2(t * 0.12, t * 0.09) + 7.3);

        // 1) 碎沫点缀：独立 noise 阈值随机撒沫，波峰处概率略增（不再由波形主导）
        float crestM = smoothstep(0.55, 0.95, vWave) * 0.35 + (1.0 - n.y) * 0.45;
        float field1 = shapeN + crestM + (detailN - 0.5) * 0.35;
        float f1 = smoothstep(0.70, 0.78, field1);

        // 2) 船尾尾迹：V 形扩散条带 + 船身周围湍流白沫，细节噪声咬边
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

        float foam = clamp(f1 + f3 * uFoamWake, 0.0, 1.0) * uFoamStrength;
        foam = clamp(foam, 0.0, 1.0);

        // 厚泡沫：接近纯白的团块，团内按形状噪声留一点水色阴影
        vec3 foamCol = vec3(0.99, 0.99, 0.97) * (0.9 + 0.1 * shapeN);
        col = mix(col, foamCol, foam * 0.95);
        // 泡沫不跟着水膜一起变透明，否则会透出下面的鱼
        alpha = max(alpha, foam * 0.9);
      }
    } else {
      // ---------- 水下仰视视角：默认全透明透出天空盒，不透明度可在控制面板调节 ----------
      col = uSkyColor;
      alpha = uUnderAlpha;
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
      uSkyColor: { value: new THREE.Color(0xbfeae6) },
      uWaterTopY: { value: TANK.waterTopY },
      uWaterBottomY: { value: TANK.waterBottomY },
      uUnderwater: { value: 0 },
      uWaterOpacity: { value: 1.0 }
    },
    vertexShader: waterVertex,
    fragmentShader: waterFragment
  });
  // 上沿高出水面盖住波浪起伏，下沿沉进底座避免露缝
  const overlapTop = 0.4;
  const sinkBottom = 0.3;
  const waterTop = TANK.waterTopY + overlapTop;
  const waterBottom = TANK.waterBottomY - sinkBottom;
  const waterH = waterTop - waterBottom;
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(TANK.waterRadius, TANK.waterRadius, waterH, 64, 1, true),
    waterMat
  );
  water.position.y = (waterTop + waterBottom) / 2;
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
      uWaveAmp: { value: 0.3 },
      uRadius: { value: TANK.waterRadius },
      uWaterTopY: { value: TANK.waterTopY },
      uOpacity: { value: 1.0 },
      uUnderAlpha: { value: 0.0 },
      // 泡沫
      uFoamOn: { value: 1 },
      uFoamStrength: { value: 1.0 },
      uFoamScale: { value: 2.6 },
      uFoamWake: { value: 1.0 },
      uBoatPos: { value: new THREE.Vector2(-1.8, 0.6) },
      uBoatDir: { value: new THREE.Vector2(Math.cos(0.5), -Math.sin(0.5)) },
      uBoatScale: { value: 1.0 },
      // 分层开关
      uLNormOn: { value: 1 },
      uLDiffOn: { value: 1 },
      uLColorOn: { value: 1 },
      uLReliefOn: { value: 1 },
      uLSssOn: { value: 1 },
      uLFresOn: { value: 1 },
      uLSpecOn: { value: 1 },
      uSpecSharp: { value: 160 },
      uSpecWideSharp: { value: 24 },
      uSpecInt: { value: 1.5 },
      uSpecWideInt: { value: 0.16 }
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
      surfaceMat.uniforms.uTime.value = t;
    }
  };
}
