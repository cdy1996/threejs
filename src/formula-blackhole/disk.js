import * as THREE from 'three';

// 事件视界（纯黑球）+ 光子环（相机朝向公告板）+ 吸积盘（极坐标噪声流动着色器）
const diskVert = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const diskFrag = /* glsl */ `
varying vec3 vPos;
uniform float uTime, uInner, uOuter, uBrightness, uSpeed;
uniform vec3 uColorA, uColorB;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  float r = length(vPos.xy);
  float theta = atan(vPos.y, vPos.x);
  float t01 = clamp((r - uInner) / max(uOuter - uInner, 1e-3), 0.0, 1.0);

  // 差速旋转：内快外慢，噪声域用笛卡尔坐标采样避免角度接缝
  float rot = uTime * uSpeed / (0.4 + r * r * 0.35);
  vec2 dirv = vec2(cos(theta + rot), sin(theta + rot));
  float n = fbm(dirv * r * 2.2 + vec2(r * 3.2 - uTime * 0.12, uTime * 0.05));
  // 细环纹 + 条纹对比度
  n = n + 0.35 * sin(r * 10.0 - uTime * 0.5 + n * 6.0);
  n = 0.32 + 0.85 * (n - 0.5);

  // 内外边缘柔化
  float fade = smoothstep(0.0, 0.14, t01) * (1.0 - smoothstep(0.42, 1.0, t01));
  // 多普勒不对称：一侧更亮
  float doppler = 1.0 + 0.7 * cos(theta - 2.3);

  vec3 col = mix(uColorA, uColorB, smoothstep(0.05, 0.85, t01));
  col = mix(col, vec3(1.0, 0.98, 0.92), pow(1.0 - t01, 3.0) * 0.5);

  float i = clamp(fade * n, 0.0, 1.4) * doppler * uBrightness * 0.85;
  gl_FragColor = vec4(col, i);
}
`;

const ringVert = /* glsl */ `
varying vec2 vUv;
uniform float uSize;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 worldPos = center + (position.x * camRight + position.y * camUp) * uSize;
  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
`;

const ringFrag = /* glsl */ `
varying vec2 vUv;
uniform float uIntensity;
void main() {
  float r = length(vUv);
  float d1 = (r - 0.52) * 15.0;
  float ring = exp(-d1 * d1);
  float d2 = (r - 0.5) * 4.5;
  float glow = exp(-d2 * d2) * 0.32;
  vec3 col = mix(vec3(1.0, 0.93, 0.75), vec3(1.0, 0.62, 0.2), glow * 2.4);
  float a = (ring + glow) * uIntensity * smoothstep(1.0, 0.82, r);
  gl_FragColor = vec4(col * a, a);
}
`;

export class DiskSystem {
  constructor(scene, params) {
    this.scene = scene;
    this.p = params;
    this.root = new THREE.Group();      // 视界 + 光子环（不随盘倾斜）
    this.diskGroup = new THREE.Group(); // 吸积盘（带倾角）
    scene.add(this.root, this.diskGroup);
    this.build();
  }

  build() {
    const { radius } = this.p.blackhole;
    const { inner, outer, temp } = this.p.disk;

    this.horizon = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    this.root.add(this.horizon);

    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: ringVert,
      fragmentShader: ringFrag,
      uniforms: {
        uSize: { value: radius * 2.2 },
        uIntensity: { value: this.p.blackhole.photonRing },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.ringMat);
    this.ring.renderOrder = 20;
    this.root.add(this.ring);

    const warm = (t) => new THREE.Color(1.0, 0.95, 0.78).lerp(new THREE.Color(0.78, 0.9, 1.0), (1 - t) / 2);
    const cool = (t) => new THREE.Color(1.0, 0.62, 0.25).lerp(new THREE.Color(0.5, 0.68, 1.0), (1 - t) / 2);

    this.diskUniforms = {
      uTime: { value: 0 },
      uInner: { value: inner },
      uOuter: { value: outer },
      uBrightness: { value: this.p.disk.brightness },
      uSpeed: { value: this.p.disk.speed },
      uColorA: { value: warm(temp) },
      uColorB: { value: cool(temp) },
    };
    this.disk = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 256, 4),
      new THREE.ShaderMaterial({
        vertexShader: diskVert,
        fragmentShader: diskFrag,
        uniforms: this.diskUniforms,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.diskGroup.add(this.disk);
    this.applyTilt();
  }

  applyTilt() {
    this.diskGroup.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(this.p.disk.tilt);
  }

  disposeAll() {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.diskGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.root.clear();
    this.diskGroup.clear();
  }

  rebuild() {
    this.disposeAll();
    this.build();
  }

  update(t) {
    this.applyTilt();
    const u = this.diskUniforms;
    u.uTime.value = t;
    u.uBrightness.value = this.p.disk.brightness;
    u.uSpeed.value = this.p.disk.speed;
    this.ringMat.uniforms.uSize.value = this.p.blackhole.radius * 2.2;
    this.ringMat.uniforms.uIntensity.value = this.p.blackhole.photonRing;
  }
}
