// 草原场景 · 大气：天空 / 云层 / 飞鸟 / 浮尘
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mulberry32 } from './noise.js';
import { cloudTexture, moteTexture } from './textures.js';

/* ------------------------------ 天空与光照 ------------------------------ */
export function createSky({ skyScale = 1.0 } = {}) {
  const sky = new Sky();
  sky.scale.setScalar(400000);
  const u = sky.material.uniforms;
  u.turbidity.value = 3.2;
  u.rayleigh.value = 1.1;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.set(0, 1, 0);

  // 天空整体亮度独立可调：Sky 的辐射亮度很高，若不单独压低，
  // 在正常曝光下会直接顶成一片死白，地面的层次也会被一起拉平。
  // 同时给输出加上限幅，避免太阳盘面把 HDR 缓冲写到极大值。
  u.uSkyScale = { value: skyScale };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float uSkyScale;')
    .replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      'gl_FragColor = vec4( min( retColor * uSkyScale, vec3( 220.0 ) ), 1.0 );'
    );
  sky.material.needsUpdate = true;

  const sun = new THREE.DirectionalLight(0xffffff, 5.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;

  const hemi = new THREE.HemisphereLight(0xbcd8f0, 0x4a5426, 0.55);

  const ambient = new THREE.AmbientLight(0xffffff, 0.12);

  return { sky, sun, hemi, ambient, uniforms: u, light: sun };
}

/** 依太阳高度角给出偏暖的地平线色调 */
export function sunTint(elevationDeg) {
  const t = THREE.MathUtils.clamp(elevationDeg / 28, 0, 1);
  const low = new THREE.Color('#ff8a3c');
  const mid = new THREE.Color('#ffd7a0');
  const high = new THREE.Color('#fff4e2');
  const c = new THREE.Color();
  if (t < 0.5) c.copy(low).lerp(mid, t / 0.5);
  else c.copy(mid).lerp(high, (t - 0.5) / 0.5);
  return c;
}

/* -------------------------------- 云层 -------------------------------- */
export function createClouds({ seed = 41 } = {}) {
  const group = new THREE.Group();
  group.name = 'clouds';
  const layers = [
    { y: 120, size: 1400, repeat: 2.2, opacity: 0.92, speed: 0.0016, tex: cloudTexture(1024, 0) },
    { y: 190, size: 1800, repeat: 1.4, opacity: 0.66, speed: 0.0009, tex: cloudTexture(1024, 3) },
    { y: 260, size: 2200, repeat: 0.9, opacity: 0.42, speed: 0.0005, tex: cloudTexture(512, 7) },
  ];
  const planes = [];
  for (const l of layers) {
    l.tex.wrapS = l.tex.wrapT = THREE.RepeatWrapping;
    l.tex.repeat.set(l.repeat, l.repeat);
    l.tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({
      map: l.tex,
      transparent: true,
      opacity: l.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      blending: THREE.NormalBlending,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l.size, l.size), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = l.y;
    m.renderOrder = -1;
    group.add(m);
    planes.push({ mesh: m, mat, layer: l });
  }
  return {
    group,
    update(t) {
      for (const p of planes) {
        p.layer.tex.offset.set(t * p.layer.speed, t * p.layer.speed * 0.42);
      }
    },
  };
}

/* -------------------------------- 飞鸟 -------------------------------- */
export function createBirds({ count = 16, seed = 777 } = {}) {
  const rnd = mulberry32(seed);
  // 一只鸟 = 两枚三角翼，aSide 区分左右
  const pos = [], side = [], idx = [];
  const wing = (s) => {
    const b = pos.length / 3;
    pos.push(0, 0.02, -0.1);
    pos.push(s * 1.0, 0.12, 0.16);
    pos.push(s * 0.92, 0.0, -0.22);
    side.push(0, s, s);
    idx.push(b, b + 1, b + 2);
  };
  wing(1); wing(-1);

  const aBird = new Float32Array(count * 4);   // radius, height, speed, phase
  const aScale = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    aBird[i * 4] = 42 + rnd() * 55;
    aBird[i * 4 + 1] = 22 + rnd() * 26;
    aBird[i * 4 + 2] = 0.035 + rnd() * 0.05;
    aBird[i * 4 + 3] = rnd();
    aScale[i] = 0.3 + rnd() * 0.22;
  }

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  geo.setIndex(idx);
  geo.setAttribute('aBird', new THREE.InstancedBufferAttribute(aBird, 4));
  geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(aScale, 1));
  geo.instanceCount = count;

  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#2b3338') },
    uSky: { value: new THREE.Color('#a8c4d8') },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aSide;
      attribute vec4 aBird;
      attribute float aScale;
      uniform float uTime;
      varying float vFade;
      void main(){
        float ang = uTime * aBird.z + aBird.w * 6.2831;
        vec3 center = vec3(cos(ang) * aBird.x, aBird.y + sin(uTime * 0.5 + aBird.w * 9.0) * 1.2, sin(ang) * aBird.x);
        vec3 fwd = normalize(vec3(-sin(ang), 0.0, cos(ang)));
        vec3 right = vec3(cos(ang), 0.0, sin(ang));

        float flap = sin(uTime * 5.2 + aBird.w * 21.0) * 0.85;
        float th = flap * sign(position.x + 1e-6);
        float c = cos(th), s = sin(th);
        vec3 p = position;
        p.xy = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

        vec3 world = center + right * (p.x * aScale) + vec3(0.0, 1.0, 0.0) * (p.y * aScale) + fwd * (p.z * aScale);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        vFade = 0.55 + 0.45 * clamp(p.x * sign(position.x + 1e-6) * 1.0, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uSky;
      varying float vFade;
      void main(){
        gl_FragColor = vec4(mix(uColor, uSky, 0.28), 0.9);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'birds';
  return { mesh, uniforms, count };
}

/* -------------------------------- 浮尘 -------------------------------- */
export function createMotes({ count = 1600, radius = 34, seed = 610 } = {}) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const seedArr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = radius * Math.cbrt(rnd());
    const a = rnd() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.25 + rnd() * 7.5;
    pos[i * 3 + 2] = Math.sin(a) * r;
    seedArr[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seedArr, 1));

  const uniforms = {
    uTime: { value: 0 },
    uProj: { value: 900 },
    uTexture: { value: moteTexture(64) },
    uColor: { value: new THREE.Color('#fff0c8') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uIntensity: { value: 0.55 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uProj;
      varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.21 + aSeed * 42.0) * 1.1;
        p.y += sin(uTime * 0.15 + aSeed * 27.0) * 0.55;
        p.z += cos(uTime * 0.19 + aSeed * 35.0) * 1.1;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = max(0.001, -mv.z);
        gl_PointSize = clamp((0.012 + aSeed * 0.026) * uProj / d, 0.6, 26.0);
        // 近处与远处都淡出，避免视觉噪点
        vA = smoothstep(0.6, 3.5, d) * (1.0 - smoothstep(24.0, 44.0, d));
        vA *= 0.35 + 0.65 * pow(abs(sin(uTime * 0.6 + aSeed * 55.0)), 1.5);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTexture;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vA;
      void main(){
        vec4 t = texture2D(uTexture, gl_PointCoord);
        float a = t.a * vA * uIntensity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'motes';
  return { points, uniforms, count };
}
