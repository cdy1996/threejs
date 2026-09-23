// 真实海面网格 + 自定义着色器
// 顶点: Gerstner 波位移 + 解析法线
// 片元: 菲涅尔反射(程序化天空) / 深度折射 / 太阳高光 / 浪尖泡沫 / 距离雾
import * as THREE from 'three';
import { waveCallsGLSL } from './waves.js';

const VERT = /* glsl */ `
uniform float uTime;
uniform float uAmplitude;
uniform float uSpeed;
uniform float uChop;
uniform float uDirAngle;

varying vec3 vWorldPos;
varying vec3 vNormal;

const float PI = 3.141592653589793;

vec3 gerstner(vec2 dir, float steep, float len, vec3 p, float t, inout vec3 tang, inout vec3 binorm) {
  float k = 2.0 * PI / len;
  float c = sqrt(9.81 / k) * uSpeed;
  float ca = cos(uDirAngle);
  float sa = sin(uDirAngle);
  vec2 d = vec2(dir.x * ca - dir.y * sa, dir.x * sa + dir.y * ca);
  float a = steep * uAmplitude / k;   // 振幅
  float s = steep * uAmplitude;       // 等效坡度（法线用）
  float f = k * (dot(d, p.xz) - c * t);

  tang   += vec3(-d.x * d.x * s * sin(f), d.x * s * cos(f), -d.x * d.y * s * sin(f));
  binorm += vec3(-d.x * d.y * s * sin(f), d.y * s * cos(f), -d.y * d.y * s * sin(f));

  return vec3(d.x * a * uChop * cos(f), a * sin(f), d.y * a * uChop * cos(f));
}

void main() {
  vec3 p = position; // 几何已旋转到 XZ 平面
  vec3 tang = vec3(1.0, 0.0, 0.0);
  vec3 binorm = vec3(0.0, 0.0, 1.0);
  vec3 disp = vec3(0.0);

${waveCallsGLSL()}

  p += disp;
  vNormal = normalize(cross(binorm, tang));
  vWorldPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uHorizonColor;
uniform vec3 uZenithColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSpecular;
uniform float uDetail;
uniform float uFoamAmount;
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec3 vWorldPos;
varying vec3 vNormal;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(19.7, -7.3);
    a *= 0.5;
  }
  return v;
}

// 细节法线用的低开销 fbm（3 个倍频）
float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(19.7, -7.3);
    a *= 0.5;
  }
  return v;
}

// 用 fbm 有限差分求细节坡度——无方向性，避免规则条纹
vec2 detailSlope(vec2 p, float t, float scale, vec2 flow, float amp) {
  vec2 q = p * scale + flow * t;
  float e = 0.6;
  float h  = fbm3(q);
  float hx = fbm3(q + vec2(e, 0.0));
  float hz = fbm3(q + vec2(0.0, e));
  return vec2(h - hx, h - hz) * amp;
}

// 与天空球一致的渐变 + 太阳（反射方向采样）
vec3 skyColor(vec3 dir) {
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uHorizonColor, uZenithColor, pow(h, 0.55));
  float s = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * pow(s, 900.0) * 5.0;   // 日盘
  col += uSunColor * pow(s, 16.0) * 0.18;   // 晕
  return col;
}

void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec2 p = vWorldPos.xz;
  float dist = length(cameraPosition - vWorldPos);

  // 大浪法线 + fbm 高频细节；细节随距离衰减，防止远处摩尔纹
  float detailFade = exp(-dist * 0.018);
  vec2 slope = detailSlope(p, uTime, 0.55, vec2(0.10, 0.07), 0.55)
             + detailSlope(p, uTime, 1.9, vec2(-0.14, 0.11), 0.30);
  vec3 N = normalize(vNormal + vec3(slope.x, 0.0, slope.y) * uDetail * detailFade);

  float ndv = max(dot(N, V), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // 反射（天空）
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyColor(R);

  // 折射（伪深度：正对看深水色，掠射/浪顶偏浅水色）
  float heightTint = clamp(vWorldPos.y * 0.6 + 0.5, 0.0, 1.0);
  vec3 refr = mix(uDeepColor, uShallowColor, clamp(exp(-ndv * 2.4) * 0.55 + heightTint * 0.35, 0.0, 1.0));

  vec3 col = mix(refr, refl, fresnel);

  // 太阳镜面高光（远处衰减，避免闪烁颗粒感）
  float spec = pow(max(dot(R, uSunDir), 0.0), 260.0);
  col += uSunColor * spec * uSunSpecular * (0.35 + 0.65 * exp(-dist * 0.004));

  // 浪尖白沫：坡度越大（1-N.y 越大）越容易破碎，fbm 打散
  float crest = clamp(1.0 - vNormal.y, 0.0, 1.0);
  float foamN = fbm(p * 0.5 + uTime * vec2(0.14, 0.11));
  float caps = smoothstep(0.5, 0.85, fbm(p * 1.4 - uTime * vec2(0.22, 0.18)));
  float foam = smoothstep(0.10, 0.34, crest * (0.6 + 0.8 * foamN) * uFoamAmount * 2.2);
  foam = clamp(foam * (0.45 + 0.55 * caps), 0.0, 1.0);
  col = mix(col, vec3(0.93, 0.96, 0.97), foam);

  // 距离雾（向地平线消退）
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, fogF);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createWater() {
  const geometry = new THREE.PlaneGeometry(700, 700, 300, 300);
  geometry.rotateX(-Math.PI / 2); // 让 position.xz 直接是世界坐标

  const uniforms = {
    uTime: { value: 0 },
    uAmplitude: { value: 0.5 },
    uSpeed: { value: 1.0 },
    uChop: { value: 0.9 },
    uDirAngle: { value: THREE.MathUtils.degToRad(25) },
    uDeepColor: { value: new THREE.Color('#06364e') },
    uShallowColor: { value: new THREE.Color('#1a7d8c') },
    uHorizonColor: { value: new THREE.Color('#cfd8de') },
    uZenithColor: { value: new THREE.Color('#5a93c4') },
    uSunDir: { value: new THREE.Vector3(0, 0.4, 0.6).normalize() },
    uSunColor: { value: new THREE.Color('#fff2dc') },
    uSunSpecular: { value: 1.2 },
    uDetail: { value: 0.35 },
    uFoamAmount: { value: 1.0 },
    uFogColor: { value: new THREE.Color('#b8cdd6') },
    uFogDensity: { value: 0.0028 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
