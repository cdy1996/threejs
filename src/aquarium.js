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

    float alpha = mix(0.17 + depth * 0.26, 0.50 + depth * 0.26, uUnderwater);
    alpha = mix(alpha, 0.84, fres * 0.6);
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

    // 八组方向正弦波：方向绕一圈铺开、波数分层，高度 + 解析偏导（用于法线）
    // 角速度取 w = 1.15·√k（深水色散关系），各波速一致，不会出现大小波互相追赶
    float h = 0.0;
    vec2 grad = vec2(0.0);
    #define WAVE(dx, dy, k, a, w) \
    { \
      vec2 d = normalize(vec2(dx, dy)); \
      float ph = dot(d, p) * k - uTime * w; \
      h += a * sin(ph); \
      grad += d * (a * k * cos(ph)); \
    }
    WAVE( 0.978,  0.208, 0.85, 0.52, 1.060)
    WAVE( 0.530,  0.848, 1.15, 0.36, 1.233)
    WAVE(-0.225,  0.974, 1.60, 0.22, 1.455)
    WAVE(-0.857,  0.515, 2.10, 0.16, 1.667)
    WAVE(-0.970, -0.242, 2.60, 0.11, 1.855)
    WAVE(-0.485, -0.875, 3.10, 0.08, 2.024)
    WAVE( 0.309, -0.951, 3.65, 0.06, 2.197)
    WAVE( 0.899, -0.438, 4.20, 0.05, 2.357)
    // 更细的短波：把大浪面再打碎一层，产生密集小起伏（体块感的关键）
    WAVE( 0.640, -0.768, 5.10, 0.042, 2.597)
    WAVE(-0.760, -0.650, 6.20, 0.033, 2.864)
    WAVE( 0.995,  0.100, 7.40, 0.026, 3.128)
    #undef WAVE

    // 双层同心涟漪（同心扩散，频率/速度错开 → 叠加出不规则的圈层起伏）
    float rlen = length(p);
    float phr = rlen * 1.4 - uTime * 1.7;
    h += 0.14 * sin(phr);
    grad += normalize(p + 0.0001) * (0.14 * 1.4 * cos(phr));
    float phr2 = rlen * 2.9 - uTime * 2.4;
    h += 0.07 * sin(phr2);
    grad += normalize(p + 0.0001) * (0.07 * 2.9 * cos(phr2));

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
  uniform float uFoamEdge;
  uniform float uRadius;
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
  uniform float uLSheenOn;
  // 波面起伏强度 / 太阳明暗对比
  uniform float uRipple;
  uniform float uSunDiff;
  // 太阳高光可调参数
  uniform float uSpecSharp;
  uniform float uSpecWideSharp;
  uniform float uSpecInt;
  uniform float uSpecWideInt;
  // 宽白泛光可调参数
  uniform vec3 uSheenColor;
  uniform float uSheenSharp;
  uniform float uSheenInt;
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

    vec3 col;
    float alpha;
    if (gl_FrontFacing) {
      // ---------- 水面上方视角 ----------
      vec3 n = normalize(vNormal);
      vec2 p = vWorldPos.xz;
      float t = uTime;

      // ① 多尺度 noise 扰动法线：把波面朝向彻底铺开。
      //    这是"硬白高光块"变成"柔和碎波光"的关键——同一束太阳光被无数小面
      //    反射向不同方向，高光自然散开；波谷也能借朝向差压出阴影。
      //    关掉开关时仍保留 45% 扰动，避免退回单一硬块。
      float nAmp = uRipple * mix(0.45, 1.0, uLNormOn);
      {
        float nx = fbm(p * 3.4 + vec2(t * 0.11, t * 0.08)) - 0.5;
        float nz = fbm(p * 3.4 - vec2(t * 0.09, t * 0.10) + 4.7) - 0.5;
        float hx = fbm(p * 9.5 + vec2(t * 0.24, t * 0.18) + 11.3) - 0.5;
        float hz = fbm(p * 9.5 - vec2(t * 0.21, t * 0.26) + 2.1) - 0.5;
        n = normalize(n + vec3(nx + hx * 0.7, 0.0, nz + hz * 0.7) * nAmp);
      }

      // ② 太阳漫反射
      float ndl = max(dot(n, uSunDir), 0.0);

      // ③ 深浅色块
      col = uShallowColor;
      float mottle = 0.5;
      if (uLColorOn > 0.5) {
        mottle = fbm(p * 1.1 + vec2(t * 0.055, -t * 0.04)) * 0.65
               + fbm(p * 2.4 - vec2(t * 0.045, t * 0.06) + 7.3) * 0.35;
        col = mix(uDeepColor, uShallowColor, clamp(mottle, 0.0, 1.0));
      }

      // ③b 高度明暗：波峰受光提亮、波谷遮挡压暗。
      //     与法线无关、纯按波高给明暗，即使在掠射角也能看出高度差——
      //     这是让水面"立起来"的核心一层。
      float hshade = smoothstep(-0.55, 0.85, vWave);
      col *= mix(0.70, 1.15, hshade);

      // ④ 伪立体光影：亮斑中心提亮、暗斑压暗，让色块"鼓起来"
      if (uLReliefOn > 0.5) {
        col += vec3(0.10, 0.15, 0.13) * smoothstep(0.58, 0.88, mottle);
        col *= 1.0 - 0.20 * smoothstep(0.42, 0.18, mottle);
      }

      // ⑤ 太阳坡面明暗 + 波峰透光（SSS）
      if (uLDiffOn > 0.5) col *= mix(1.0 - 0.55 * uSunDiff, 1.0 + 0.45 * uSunDiff, ndl);
      if (uLSssOn > 0.5) {
        float sss = pow(max(dot(V, normalize(uSunDir + vec3(0.0, 0.35, 0.0))), 0.0), 3.0);
        col += vec3(0.30, 0.85, 0.62) * sss * smoothstep(0.3, 1.0, vWave) * 0.35;
      }

      // ⑥ 菲涅尔天空反射（掠射角）
      float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
      if (uLFresOn > 0.5) col = mix(col, uSkyColor, fres * 0.7);

      // ⑦ 太阳高光：宽软瓣（大面积柔和反光）+ 窄碎瓣（波光闪点）。
      //    两者都建立在扰动法线上——宽瓣铺成柔和光泽，窄瓣碎成点点波光，
      //    不再是光滑法线下的单一硬白块。
      if (uLSpecOn > 0.5) {
        vec3 R = reflect(-V, n);
        float ndh = max(dot(R, uSunDir), 0.0);
        float specWide = pow(ndh, uSpecWideSharp);
        float spec = pow(ndh, uSpecSharp);
        col += vec3(1.0, 0.98, 0.92) * (spec * uSpecInt + specWide * uSpecWideInt);
      }

      // ⑧ 宽白泛光：光照驱动的超宽瓣（近似高粗糙度反射）
      if (uLSheenOn > 0.5) {
        float sheen = pow(max(dot(n, uSunDir), 0.0), uSheenSharp);
        col = mix(col, uSheenColor, clamp(sheen * uSheenInt, 0.0, 1.0));
      }

      // 半透明水膜：正视角透出水下的鱼和海底，掠射角反射天空而变实；
      // 波峰处略实一点，让起伏边缘更"有肉"
      alpha = mix(0.58, 0.95, fres) * uOpacity;
      alpha = max(alpha, hshade * 0.18 * uOpacity);

      // ---------- 泡沫：随机碎沫 + 船体接触浪花 ----------
      if (uFoamOn > 0.5) {
        vec2 ps = p * vec2(0.7, 1.0);
        float shapeN = fbm(ps * uFoamScale + vec2(t * 0.08, -t * 0.05));
        float detailN = fbm(ps * uFoamScale * 3.4 - vec2(t * 0.12, t * 0.09) + 7.3);
        float froth = fbm(ps * uFoamScale * 8.0 + vec2(t * 0.35, t * 0.30) + 3.1);

        // 1) 波峰/坡面随机碎沫
        float crestM = smoothstep(0.55, 0.95, vWave) * 0.35 + (1.0 - n.y) * 0.45;
        float f1 = smoothstep(0.66, 0.74, shapeN + crestM + (detailN - 0.5) * 0.35);

        // 2) 船：环船白沫 + 船首劈水 + 船尾 V 形尾迹
        vec2 d = p - uBoatPos;
        float dl = length(d);
        vec2 fwd = uBoatDir;
        vec2 side = vec2(-fwd.y, fwd.x);
        float lx = dot(d, fwd);
        float lz = dot(d, side);
        float sc = max(uBoatScale, 0.001);

        // 环船白沫：带宽略宽，避免贴成一道硬白线
        float hullRing = exp(-pow((dl - 1.3 * sc) / (0.62 * sc), 2.0));
        float bowV = exp(-pow(abs(lz / sc) - clamp(lx / sc + 0.7, 0.0, 2.4) * 0.7, 2.0) * 6.0)
                   * smoothstep(-1.4, 0.3, lx / sc);
        float behind = smoothstep(0.6, -0.4, lx);
        float spread = (-lx) * 0.55 + 0.35;
        float vband = exp(-pow(abs(lz) - spread * 0.75, 2.0) * 8.0) * behind;

        float distFade = smoothstep(5.5, 1.2, dl);
        float ship = (hullRing * 1.15 + bowV * 0.9 + vband) * distFade * sc;
        ship *= smoothstep(0.34, 0.58,
                           shapeN + (detailN - 0.5) * 0.5 + hullRing * 0.9 + bowV * 0.6);

        float foam = clamp((f1 + ship * uFoamWake) * uFoamStrength, 0.0, 1.0);

        // 泡沫不是纯白贴片：混入一点水色、用高频噪声咬出细孔，呈"沸腾"质感
        vec3 foamCol = mix(vec3(0.99, 0.99, 0.97), col, 0.16) * (0.88 + 0.14 * froth);
        foam *= 0.70 + 0.30 * smoothstep(0.25, 0.75, froth);
        col = mix(col, foamCol, foam * 0.95);
        // 泡沫不跟着水膜一起变透明，否则会透出下面的鱼
        alpha = max(alpha, foam * 0.92);
      }

      // 水与玻璃交界的弯月面亮边
      float rr = length(p) / uRadius;
      float edge = smoothstep(0.88, 0.995, rr);
      col = mix(col, vec3(0.94, 0.995, 0.97), edge * uFoamEdge);
      alpha = max(alpha, edge * uFoamEdge * 0.45);
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
  const overlapTop = 0.85;
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
  const surfaceGeo = makeDiscSurfaceGeometry(TANK.waterRadius * 0.998, 24, 128);
  const surfaceMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uShallowColor: { value: new THREE.Color(COLORS.waterShallow) },
      // 暗端用深青绿（不是蓝）：参考图的水面暗部是绿，蓝在下面的水体上
      uDeepColor: { value: new THREE.Color(0x0f6b5c) },
      uSkyColor: { value: new THREE.Color(0xbfeae6) },
      uSunDir: { value: sunDir },
      uTime: { value: 0 },
      uWaveAmp: { value: 0.36 },
      uRadius: { value: TANK.waterRadius },
      uWaterTopY: { value: TANK.waterTopY },
      uOpacity: { value: 0.62 },
      uUnderAlpha: { value: 0.0 },
      // 泡沫
      uFoamOn: { value: 1 },
      uFoamStrength: { value: 0.9 },
      uFoamScale: { value: 3.5 },
      uFoamWake: { value: 1.0 },
      uFoamEdge: { value: 0.35 },
      uBoatPos: { value: new THREE.Vector2(-1.8, 0.6) },
      uBoatDir: { value: new THREE.Vector2(Math.cos(0.5), -Math.sin(0.5)) },
      uBoatScale: { value: 1.0 },
      // 分层开关
      uLNormOn: { value: 1 },
      uLDiffOn: { value: 1 },
      uLColorOn: { value: 0 },
      uLReliefOn: { value: 1 },
      uLSssOn: { value: 1 },
      uLFresOn: { value: 1 },
      uLSpecOn: { value: 1 },
      uLSheenOn: { value: 1 },
      uRipple: { value: 0.36 },
      uSunDiff: { value: 0 },
      // 窄瓣：波光闪点；宽瓣：柔和反光（指数远小于窄瓣 → 大面积软光而非硬块）
      uSpecSharp: { value: 110 },
      uSpecWideSharp: { value: 22 },
      uSpecInt: { value: 1.05 },
      uSpecWideInt: { value: 0.34 },
      uSheenColor: { value: new THREE.Color(0xdff3ec) },
      uSheenSharp: { value: 5 },
      uSheenInt: { value: 0.42 }
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
