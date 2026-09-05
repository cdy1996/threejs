/**
 * 黑洞引力透镜着色器（Schwarzschild 测地线近似 · 光线步进）
 */

export const params = {
  // Lensing
  lensing: 1.0,
  steps: 180,
  // Disk - Density & Radii
  diskInner: 2.6,
  diskOuter: 13.0,
  density: 5.5,
  // Disk - Noise & Flow
  flowSpeed: 1.0,
  noiseScale: 1.4,
  beamStrength: 1.1,
  // Disk - Colors
  colHot: '#ffedd0',
  colMid: '#ff8f1f',
  colOuter: '#9c2b08',
  // PostProcessing - Bloom
  bloomStrength: 0.6,
  bloomRadius: 0.65,
  bloomThreshold: 0.75,
  exposure: 1.0,
  timeScale: 1.0
};

export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform vec3 uCamPos;
  uniform mat3 uCamBasis;
  uniform float uTanFov;
  uniform float uAspect;
  uniform float uTime;

  uniform float uLens;
  uniform float uDiskIn;
  uniform float uDiskOut;
  uniform float uDensity;
  uniform float uFlow;
  uniform float uNoiseScale;
  uniform float uBeam;
  uniform vec3 uColHot;
  uniform vec3 uColMid;
  uniform vec3 uColOuter;

  const float RS = 1.0;          // 史瓦西半径
  const int STEPS = 180;         // 光线步进次数

  // ---------- hash / noise / fbm ----------
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.55;
    for (int i = 0; i < 4; i++) {
      v += a * noise2(p);
      p = p * 2.03 + 11.3;
      a *= 0.5;
    }
    return v;
  }

  // ---------- 背景星空 ----------
  vec3 starField(vec3 rd) {
    vec3 col = vec3(0.0);
    float phi = atan(rd.z, rd.x);
    float th = asin(clamp(rd.y, -1.0, 1.0));
    for (int l = 0; l < 2; l++) {
      float scale = 22.0 + float(l) * 41.0;
      vec2 uv = vec2(phi, th) * scale;
      vec2 id = floor(uv);
      vec2 f = fract(uv);
      float h = hash21(id + float(l) * 17.17);
      if (h > 0.965) {
        vec2 sp = vec2(hash21(id + 1.3), hash21(id + 2.7)) * 0.6 + 0.2;
        float d = length(f - sp);
        float b = smoothstep(0.06, 0.0, d) * (h - 0.965) / 0.035;
        float tw = 0.7 + 0.3 * sin(uTime * 2.0 + h * 90.0);
        col += vec3(1.0, 0.96, 0.9) * b * tw * 0.8;
      }
    }
    // 极淡星云
    float neb = fbm(rd.xy * 2.5 + rd.z * 1.7);
    col += vec3(0.020, 0.024, 0.042) * neb;
    return col;
  }

  // ---------- 吸积盘着色 ----------
  vec4 diskShade(vec3 p, vec3 rd) {
    float r = length(p.xz);
    float phi = atan(p.z, p.x);
    // 开普勒差速旋转（角速度 ∝ r^-1.5）
    float sw = phi - uTime * uFlow * 7.0 / pow(r, 1.5);
    // 在随流体旋转的笛卡尔坐标里采样噪声 → 无接缝且拉出弧形条纹
    vec2 q = vec2(cos(sw), sin(sw)) * r;
    float n = fbm(q * uNoiseScale * 0.6);
    n = mix(0.55, 1.45, n);

    float radial = pow(uDiskIn / r, 3.2);                       // 内亮外暗
    float edgeOut = smoothstep(uDiskOut, uDiskOut * 0.7, r);    // 外缘淡出
    float edgeIn = smoothstep(uDiskIn * 0.92, uDiskIn * 1.3, r);
    // 多普勒束流：物质朝向观察者一侧增亮
    vec3 tangent = normalize(vec3(-p.z, 0.0, p.x));
    float beam = 1.0 + uBeam * dot(tangent, -rd) * (uDiskIn / r);

    float intensity = radial * n * uDensity * beam * edgeOut * edgeIn;
    intensity = max(intensity, 0.0);

    vec3 col = mix(uColOuter, uColMid, clamp(intensity * 0.5, 0.0, 1.0));
    col = mix(col, uColHot, clamp(pow(intensity / uDensity, 1.6) * 1.5, 0.0, 1.0));

    float alpha = clamp(intensity * 0.7, 0.0, 1.0);
    return vec4(col * intensity, alpha);
  }

  // ---------- 主渲染：测地线步进 ----------
  vec3 render(vec2 ndc) {
    vec3 dir = normalize(uCamBasis * vec3(ndc.x * uAspect * uTanFov, ndc.y * uTanFov, -1.0));
    vec3 pos = uCamPos;

    // 角动量守恒项（决定光线弯曲程度）
    vec3 hv = cross(pos, dir);
    float h2 = dot(hv, hv) * uLens;

    vec3 col = vec3(0.0);
    float accA = 0.0;
    bool captured = false;

    for (int i = 0; i < STEPS; i++) {
      float r2 = dot(pos, pos);
      float r = sqrt(r2);
      if (r2 < RS * RS) { captured = true; break; }        // 落入事件视界
      if (r2 > 1600.0 && dot(pos, dir) > 0.0) break;        // 逃逸

      float dt = clamp(r * 0.11, 0.045, 0.45);              // 自适应步长
      // Schwarzschild 零测地线近似弯曲：a = -1.5 h² r̂ / r⁴
      vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
      dir = normalize(dir + acc * dt);

      vec3 np = pos + dir * dt;

      // 穿越吸积盘平面（y=0）：线性插值求交点
      if (pos.y * np.y < 0.0) {
        float tt = pos.y / (pos.y - np.y);
        vec3 hit = mix(pos, np, tt);
        float hr = length(hit.xz);
        if (hr > uDiskIn * 0.9 && hr < uDiskOut) {
          vec4 dc = diskShade(hit, dir);
          col += dc.rgb * (1.0 - accA);
          accA = clamp(accA + dc.a * 0.85, 0.0, 1.0);
        }
      }
      pos = np;
    }

    if (!captured) {
      col += starField(normalize(dir)) * (1.0 - accA);
    }
    return col;
  }

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 col = render(ndc);
    gl_FragColor = vec4(col, 1.0);
  }
`;
