// 程序化天空：地平线渐变 + 太阳 + fbm 云层
// 同时作为 scene.environment 的采样来源（玻璃反射/折射）
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uCloudCover;
uniform float uTime;

varying vec3 vDir;

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
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.11 + vec2(13.5, 7.9);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;

  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  if (h < 0.0) {
    col = mix(uHorizon, uHorizon * 0.5, clamp(-h * 3.0, 0.0, 1.0));
  }

  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * pow(s, 1500.0) * 10.0;  // 日盘
  col += uSunColor * pow(s, 20.0) * 0.22;    // 光晕

  // 云层（投影到天顶平面上采样 fbm）
  if (h > 0.015) {
    vec2 cp = d.xz / (h + 0.18);
    float cl = fbm(cp * 1.5 + uTime * 0.008);
    float cover = smoothstep(1.0 - uCloudCover - 0.3, 1.0 - uCloudCover + 0.35, cl);
    float horizonFade = smoothstep(0.015, 0.15, h);
    vec3 cloudCol = mix(vec3(0.88, 0.91, 0.95), vec3(1.02), pow(s, 2.0));
    col = mix(col, cloudCol, cover * 0.8 * (0.35 + 0.65 * horizonFade));
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSky() {
  const uniforms = {
    uHorizon: { value: new THREE.Color('#cfd8de') },
    uZenith: { value: new THREE.Color('#5a93c4') },
    uSunDir: { value: new THREE.Vector3(0, 0.4, 0.6).normalize() },
    uSunColor: { value: new THREE.Color('#fff2dc') },
    uCloudCover: { value: 0.45 },
    uTime: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
