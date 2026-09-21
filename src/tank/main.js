import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ============================================================
 * 水缸微景观 —— 全程序化建模（独立场景，不复用其他页面代码）
 * 构成：木质底座 / 水体 / 波浪水面 / 渔船 / 救生圈
 *       鱼群 / 海带 / 珊瑚 / 苔藓岩石 / 沙地 / 气泡
 * ============================================================ */

// ---------- 常量 ----------
const TANK_SIZE = 6;          // 玻璃缸截面边长
const WATER_SIZE = 5.7;       // 水体截面边长（与玻璃壁之间留浅白间隔）
const WATER_TOP = 1.9;        // 水面高度
const TANK_BOTTOM = -2.0;     // 水缸内底
const WALL_TOP = WATER_TOP + 0.28; // 玻璃壁顶（略高于水面）
const timeUniform = { value: 0 };

// ---------- 渲染器 / 场景 / 相机 ----------
const container = document.getElementById('scene-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0c4048, 18, 42);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(8.5, 4.6, 10.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.55;
controls.minDistance = 5;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.52;

// ---------- 灯光 ----------
scene.add(new THREE.HemisphereLight(0xbfe8e2, 0x33524a, 1.1));

const keyLight = new THREE.DirectionalLight(0xfff3d8, 2.0);
keyLight.position.set(6, 10, 4);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x7fd8d0, 0.8);
rimLight.position.set(-6, 4, -6);
scene.add(rimLight);

// ---------- 工具函数 ----------
const rand = (a, b) => a + Math.random() * (b - a);

// 确定性伪噪声（用于岩石/沙地形变）
function noise3(x, y, z) {
  return (
    Math.sin(x * 2.1 + y * 1.3 + z * 1.7) * 0.5 +
    Math.sin(x * 4.3 - y * 3.1 + z * 2.9) * 0.3 +
    Math.sin(x * 8.7 + y * 6.3 - z * 5.1) * 0.2
  );
}

// 波浪高度（水面网格与船体浮力共用同一函数）
function waveHeight(x, z, t) {
  return (
    Math.sin(x * 1.5 + t * 1.3) * 0.07 +
    Math.cos(z * 1.9 + t * 1.05) * 0.055 +
    Math.sin((x + z) * 1.1 + t * 1.9) * 0.04
  );
}

// ---------- 木质底座 ----------
{
  const baseGroup = new THREE.Group();

  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc9a06b, roughness: 0.85 });
  const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0xb08a58, roughness: 0.9 });

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.35, 1.7, 48), woodMat);
  pedestal.position.y = TANK_BOTTOM - 0.95;
  baseGroup.add(pedestal);

  const topRim = new THREE.Mesh(new THREE.CylinderGeometry(4.35, 4.15, 0.35, 48), woodDarkMat);
  topRim.position.y = TANK_BOTTOM - 0.18;
  baseGroup.add(topRim);

  const footRim = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.6, 0.3, 48), woodDarkMat);
  footRim.position.y = TANK_BOTTOM - 1.85;
  baseGroup.add(footRim);

  scene.add(baseGroup);
}

// ---------- 玻璃壁 + 水体（两层结构，中间留浅白间隔） ----------
{
  const hWall = WALL_TOP - TANK_BOTTOM;

  // 外层玻璃盒：近白色、极低透明度，只负责反光轮廓
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf6f2,
    transparent: true,
    opacity: 0.1,
    roughness: 0.05,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(TANK_SIZE, hWall, TANK_SIZE), glassMat);
  glass.position.y = TANK_BOTTOM + hWall / 2;
  glass.renderOrder = 12;
  scene.add(glass);

  // 内部水体：比玻璃壁内缩一圈，颜色更饱和
  const hWater = WALL_TOP - 0.05 - TANK_BOTTOM;
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x2fa89e,
    transparent: true,
    opacity: 0.3,
    roughness: 0.08,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const waterBody = new THREE.Mesh(new THREE.BoxGeometry(WATER_SIZE, hWater, WATER_SIZE), waterMat);
  waterBody.position.y = TANK_BOTTOM + hWater / 2;
  waterBody.renderOrder = 10;
  scene.add(waterBody);

  // 水线（meniscus）：沿玻璃内壁一圈浅白细条
  const meniscusMat = new THREE.MeshBasicMaterial({ color: 0xe8faf4, transparent: true, opacity: 0.4, depthWrite: false });
  const mkStrip = (w, d, x, z) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), meniscusMat);
    s.position.set(x, WATER_TOP + 0.02, z);
    s.renderOrder = 13;
    scene.add(s);
  };
  const inner = TANK_SIZE / 2 - 0.03;
  mkStrip(TANK_SIZE - 0.05, 0.05, 0, inner);
  mkStrip(TANK_SIZE - 0.05, 0.05, 0, -inner);
  mkStrip(0.05, TANK_SIZE - 0.05, inner, 0);
  mkStrip(0.05, TANK_SIZE - 0.05, -inner, 0);

  // 玻璃顶沿亮框（玻璃厚度反光）
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xf2fffb, transparent: true, opacity: 0.5, depthWrite: false });
  const mkRim = (w, d, x, z) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), rimMat);
    s.position.set(x, WALL_TOP, z);
    s.renderOrder = 13;
    scene.add(s);
  };
  const outer = TANK_SIZE / 2;
  mkRim(TANK_SIZE + 0.04, 0.07, 0, outer);
  mkRim(TANK_SIZE + 0.04, 0.07, 0, -outer);
  mkRim(0.07, TANK_SIZE + 0.04, outer, 0);
  mkRim(0.07, TANK_SIZE + 0.04, -outer, 0);

  // 底部封口（不透明，防止看穿）
  const bottom = new THREE.Mesh(
    new THREE.BoxGeometry(TANK_SIZE, 0.1, TANK_SIZE),
    new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 1 })
  );
  bottom.position.y = TANK_BOTTOM - 0.05;
  scene.add(bottom);
}

// ---------- 波浪水面（独立 ShaderMaterial：波高明暗 + 高光闪斑 + 泡沫） ----------
// 顶点波浪公式与 JS 的 waveHeight 保持同一组常数，保证船体浮力同步
{
  const seg = 110;
  const geo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const waterShaderMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: timeUniform,
      uSunDir: { value: new THREE.Vector3(6, 10, 4).normalize() }, // 与 keyLight 一致
      uDeep: { value: new THREE.Color(0x1f8a84) },    // 波谷深青
      uShallow: { value: new THREE.Color(0x86ddd2) }, // 波峰浅青
      uSky: { value: new THREE.Color(0xd8f6ef) }      // Fresnel 掠射白
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vH;

      float waveH(vec2 p, float t) {
        return sin(p.x * 1.5 + t * 1.3) * 0.07
             + cos(p.y * 1.9 + t * 1.05) * 0.055
             + sin((p.x + p.y) * 1.1 + t * 1.9) * 0.04;
      }

      void main() {
        vec3 pos = position; // 平面已旋转：xz 为平面坐标，y 朝上
        float h = waveH(pos.xz, uTime);
        float e = 0.12;
        float hx = waveH(pos.xz + vec2(e, 0.0), uTime) - h;
        float hz = waveH(pos.xz + vec2(0.0, e), uTime) - h;
        pos.y += h;
        vNormal = normalize(vec3(-hx / e, 1.0, -hz / e));
        vH = h;
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vH;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
          v += vnoise(p) * a;
          p *= 2.1;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);

        // 基色：波峰亮、波谷暗
        vec3 col = mix(uDeep, uShallow, smoothstep(-0.12, 0.14, vH));

        // Fresnel：掠射角泛白
        float fres = pow(1.0 - max(dot(N, V), 0.0), 2.0);
        col = mix(col, uSky, fres * 0.55);

        // 太阳高光 + 滚动噪声闪斑（波光粼粼）
        vec3 H = normalize(normalize(uSunDir) + V);
        float spec = pow(max(dot(N, H), 0.0), 90.0);
        float glint = vnoise(vWorldPos.xz * 3.0 + vec2(uTime * 0.6, -uTime * 0.45));
        glint = smoothstep(0.5, 0.85, glint);
        float sparkle = spec * (1.6 + 4.0 * glint);
        col += vec3(sparkle);

        // 拉伸 FBM 泡沫 streak，随波峰起伏
        float foam = fbm(vec2(vWorldPos.x * 0.7 + uTime * 0.22, vWorldPos.z * 2.4 - uTime * 0.1));
        float foamMask = smoothstep(0.6, 0.76, foam) * smoothstep(0.0, 0.1, vH);
        col = mix(col, vec3(0.94, 1.0, 0.98), foamMask * 0.4);

        float alpha = 0.72 + fres * 0.25;
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const mesh = new THREE.Mesh(geo, waterShaderMat);
  mesh.position.y = WATER_TOP;
  mesh.renderOrder = 11;
  scene.add(mesh);
}

// ---------- 沙地（带起伏与色斑） ----------
{
  const geo = new THREE.PlaneGeometry(WATER_SIZE - 0.12, WATER_SIZE - 0.12, 40, 40);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cSand = new THREE.Color(0xdcc9a0);
  const cSandDark = new THREE.Color(0xc4ad82);
  const cAlgae = new THREE.Color(0x9fae6a);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, noise3(x * 0.8, 0, z * 0.8) * 0.09);
    tmp.copy(cSand).lerp(cSandDark, Math.random() * 0.5);
    if (noise3(x * 1.4, 3.7, z * 1.4) > 0.45) tmp.lerp(cAlgae, 0.45);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const sand = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  sand.position.y = TANK_BOTTOM + 0.06;
  scene.add(sand);
}

// ---------- 苔藓岩石 ----------
function makeRock(radius, px, py, pz, mossiness) {
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = 1 + noise3(v.x * 1.2 / radius, v.y * 1.2 / radius, v.z * 1.2 / radius) * 0.22;
    v.multiplyScalar(d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  // 顶点色：朝上/高处长苔藓，其余是沙褐色
  const colors = new Float32Array(pos.count * 3);
  const nrm = geo.attributes.normal;
  const cMoss = new THREE.Color(0x77c04e);
  const cMossLight = new THREE.Color(0xa8d96a);
  const cStone = new THREE.Color(0xc9bd97);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const up = nrm.getY(i);
    tmp.copy(cStone);
    const mossAmt = THREE.MathUtils.clamp((up - 0.15) * mossiness + noise3(pos.getX(i) * 3, pos.getY(i) * 3, pos.getZ(i) * 3) * 0.25, 0, 1);
    tmp.lerp(Math.random() > 0.5 ? cMoss : cMossLight, mossAmt);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  rock.position.set(px, py, pz);
  scene.add(rock);
  return rock;
}
makeRock(1.45, -1.15, TANK_BOTTOM + 0.75, 0.75, 1.5);
makeRock(1.05, 1.35, TANK_BOTTOM + 0.55, -0.85, 1.4);
makeRock(0.6, 1.9, TANK_BOTTOM + 0.35, 1.5, 1.6);
makeRock(0.5, -2.1, TANK_BOTTOM + 0.3, -1.6, 1.6);

// ---------- 海带（顶点着色器摇摆） ----------
function makeKelpMaterial(color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float phase = modelMatrix[3].x * 3.1 + modelMatrix[3].z * 4.7;
       float hRatio = clamp(position.y / 2.8, 0.0, 1.0);
       float sway = sin(uTime * 1.25 + phase + position.y * 1.4) * hRatio * hRatio;
       transformed.x += sway * 0.38;
       transformed.z += cos(uTime * 0.9 + phase * 1.3 + position.y) * hRatio * hRatio * 0.22;`
    );
  };
  return mat;
}
const kelpMatA = makeKelpMaterial(0x1e5c46);
const kelpMatB = makeKelpMaterial(0x2e7355);

function makeKelpCluster(cx, cz, count) {
  for (let i = 0; i < count; i++) {
    const h = rand(2.2, 3.1);
    const geo = new THREE.PlaneGeometry(rand(0.22, 0.38), h, 1, 16);
    geo.translate(0, h / 2, 0);
    const kelp = new THREE.Mesh(geo, Math.random() > 0.5 ? kelpMatA : kelpMatB);
    kelp.position.set(cx + rand(-0.5, 0.5), TANK_BOTTOM + 0.1, cz + rand(-0.5, 0.5));
    kelp.rotation.y = rand(0, Math.PI * 2);
    scene.add(kelp);

    // 叶片小球点缀
    if (Math.random() > 0.4) {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(rand(0.09, 0.15), 6, 5),
        new THREE.MeshStandardMaterial({ color: 0x5da85f, roughness: 0.9 })
      );
      leaf.scale.set(1, 1.6, 0.6);
      leaf.position.set(kelp.position.x + rand(-0.1, 0.1), TANK_BOTTOM + h * rand(0.55, 0.85), kelp.position.z + rand(-0.1, 0.1));
      scene.add(leaf);
    }
  }
}
makeKelpCluster(-2.3, -0.6, 7);   // 左侧海带林
makeKelpCluster(2.35, 0.4, 7);    // 右侧海带林
makeKelpCluster(0.4, -2.3, 4);    // 后侧少量

// ---------- 珊瑚（递归分枝） ----------
function makeCoral(color, px, pz, scale = 1) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  const group = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);

  function branch(origin, dir, len, r, depth) {
    const end = origin.clone().addScaledVector(dir, len);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.65, r, len, 5), mat);
    seg.position.copy(origin).addScaledVector(dir, len / 2);
    seg.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    group.add(seg);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.85, 6, 5), mat);
    tip.position.copy(end);
    group.add(tip);

    if (depth > 0) {
      const kids = depth >= 3 ? 3 : 2;
      for (let i = 0; i < kids; i++) {
        const nd = dir.clone()
          .applyAxisAngle(new THREE.Vector3(1, 0, 0), rand(-0.7, 0.7))
          .applyAxisAngle(new THREE.Vector3(0, 0, 1), rand(-0.7, 0.7))
          .applyAxisAngle(up, rand(0, Math.PI * 2))
          .lerp(up, 0.35)
          .normalize();
        branch(end, nd, len * rand(0.6, 0.75), r * 0.68, depth - 1);
      }
    }
  }
  branch(new THREE.Vector3(0, 0, 0), up.clone(), 0.55, 0.09, 3);
  group.position.set(px, TANK_BOTTOM + 0.1, pz);
  group.scale.setScalar(scale);
  scene.add(group);
}
makeCoral(0xe2574c, 1.7, 2.15, 1.35);   // 右前红珊瑚
makeCoral(0xf2839b, -1.9, 1.9, 1.0);    // 左前粉珊瑚
makeCoral(0xd94f43, -0.3, 2.35, 0.8);   // 前方小珊瑚

// ---------- 鱼群 ----------
const fishes = [];
const fishPalette = [0xd9e14a, 0x9fd94f, 0x63cfc0, 0xf2d54a, 0x7fd98f];

function makeFish() {
  const group = new THREE.Group();
  const color = fishPalette[Math.floor(Math.random() * fishPalette.length)];
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat);
  body.scale.set(0.65, 0.9, 1.9);   // 沿 z 拉长（lookAt 以 +z 朝向目标）
  group.add(body);

  const tailGeo = new THREE.ConeGeometry(0.11, 0.22, 4);
  tailGeo.rotateX(Math.PI / 2);     // 锥尖朝 +z
  const tail = new THREE.Mesh(tailGeo, mat);
  tail.scale.set(0.5, 1, 1);
  tail.position.z = -0.36;
  group.add(tail);

  // 背鳍
  const finGeo = new THREE.ConeGeometry(0.07, 0.14, 4);
  const fin = new THREE.Mesh(finGeo, mat);
  fin.scale.set(0.4, 1, 1);
  fin.position.set(0, 0.15, -0.02);
  group.add(fin);

  const s = rand(0.7, 1.25);
  group.scale.setScalar(s);

  // 游动参数：绕椭圆轨道 + 垂直起伏
  const data = {
    group, tail,
    cx: rand(-0.5, 0.5),
    cz: rand(-0.5, 0.5),
    rx: rand(1.0, 2.3),
    rz: rand(0.8, 2.1),
    speed: rand(0.25, 0.55) * (Math.random() > 0.5 ? 1 : -1),
    phase: rand(0, Math.PI * 2),
    baseY: rand(TANK_BOTTOM + 0.7, WATER_TOP - 0.7),
    bobAmp: rand(0.08, 0.25),
    bobSpeed: rand(0.8, 1.6)
  };
  fishes.push(data);
  scene.add(group);
}
for (let i = 0; i < 34; i++) makeFish();

// ---------- 气泡 ----------
const bubbles = [];
{
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.3
  });
  for (let i = 0; i < 16; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(rand(0.02, 0.06), 8, 6), bubbleMat);
    b.position.set(rand(-2.4, 2.4), rand(TANK_BOTTOM + 0.3, WATER_TOP - 0.2), rand(-2.4, 2.4));
    b.userData.speed = rand(0.25, 0.6);
    bubbles.push(b);
    scene.add(b);
  }
}

// ---------- 渔船 ----------
const boat = (() => {
  const boat = new THREE.Group();

  // 船体侧面轮廓（船头朝 +x）
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-1.1, 0.15);            // 船尾水线
  hullShape.lineTo(-1.05, 0.62);           // 船尾舷缘
  hullShape.lineTo(0.75, 0.62);            // 舷缘至船头前
  hullShape.quadraticCurveTo(1.35, 0.55, 1.45, 0.1);   // 船头弧线下压
  hullShape.quadraticCurveTo(1.15, -0.28, 0.4, -0.34); // 船底前段
  hullShape.lineTo(-0.75, -0.34);          // 平底
  hullShape.quadraticCurveTo(-1.1, -0.25, -1.1, 0.15);

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.85, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2, steps: 1
  });
  hullGeo.translate(0, 0, -0.425);
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: 0xe8962f, roughness: 0.65 }));
  boat.add(hull);

  // 黑色船底水线带
  const bottomBand = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.2, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.8 })
  );
  bottomBand.position.set(-0.1, -0.26, 0);
  boat.add(bottomBand);

  // 甲板
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.06, 0.78),
    new THREE.MeshStandardMaterial({ color: 0xd8c49a, roughness: 0.9 })
  );
  deck.position.set(-0.12, 0.63, 0);
  boat.add(deck);

  // 驾驶室（白色舱体 + 深色窗）
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.7 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.55), cabinMat);
  cabin.position.set(-0.42, 0.94, 0);
  boat.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 0.64),
    new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.8 }));
  roof.position.set(-0.42, 1.22, 0);
  boat.add(roof);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x1d3038, roughness: 0.3, metalness: 0.4 });
  const winF = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.42), winMat);
  winF.position.set(-0.1, 1.0, 0);
  boat.add(winF);
  const winS1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.03), winMat);
  winS1.position.set(-0.42, 1.0, 0.285);
  boat.add(winS1);
  const winS2 = winS1.clone();
  winS2.position.z = -0.285;
  boat.add(winS2);

  // 桅杆 + 天线
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.8 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.15, 6), mastMat);
  mast.position.set(0.35, 1.2, 0);
  boat.add(mast);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), mastMat);
  boom.rotation.z = Math.PI / 2 - 0.25;
  boom.position.set(0.62, 1.45, 0);
  boat.add(boom);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 4), mastMat);
  antenna.position.set(-0.42, 1.5, 0.1);
  boat.add(antenna);

  // 船首栏杆
  const railMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 4), railMat);
    post.position.set(0.55 + i * 0.2, 0.77 - i * 0.012, 0.33);
    boat.add(post);
    const post2 = post.clone();
    post2.position.z = -0.33;
    boat.add(post2);
  }
  const railBar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.68, 4), railMat);
  railBar.rotation.z = Math.PI / 2 - 0.06;
  railBar.position.set(0.85, 0.9, 0.33);
  boat.add(railBar);
  const railBar2 = railBar.clone();
  railBar2.position.z = -0.33;
  boat.add(railBar2);

  // 轮胎防撞垫（左右舷各 2）
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.95 });
  [[-0.45, 0.5], [0.25, 0.52], [-0.45, -0.5], [0.25, -0.52]].forEach(([tx, tz]) => {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.05, 6, 12), tireMat);
    tire.position.set(tx, 0.32, tz);
    boat.add(tire);
  });

  // 船锚（船头侧面）
  const anchorMat = new THREE.MeshStandardMaterial({ color: 0x6b7178, roughness: 0.5, metalness: 0.6 });
  const anchor = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 5), anchorMat);
  anchor.add(shaft);
  const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 5), anchorMat);
  cross.rotation.z = Math.PI / 2;
  cross.position.y = 0.12;
  anchor.add(cross);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 10), anchorMat);
  ring.position.y = 0.2;
  anchor.add(ring);
  const flukeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), anchorMat);
  flukeL.scale.set(1.4, 0.8, 0.8);
  flukeL.position.set(0.09, -0.15, 0);
  anchor.add(flukeL);
  const flukeR = flukeL.clone();
  flukeR.position.x = -0.09;
  anchor.add(flukeR);
  anchor.position.set(1.05, 0.35, 0.35);
  anchor.rotation.x = 0.15;
  boat.add(anchor);

  // 船尾小救生圈装饰
  const miniBuoy = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.035, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.7 })
  );
  miniBuoy.position.set(-0.95, 0.8, 0);
  miniBuoy.rotation.y = Math.PI / 2;
  boat.add(miniBuoy);

  boat.scale.setScalar(0.95);
  scene.add(boat);
  return boat;
})();
const boatPos = new THREE.Vector2(1.5, -0.7);
const boatHeading = -0.45;

// ---------- 漂浮救生圈（红白相间） ----------
const lifebuoy = (() => {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.1, 10, 24),
    new THREE.MeshStandardMaterial({ color: 0xe8413c, roughness: 0.6 })
  );
  group.add(ring);
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.23, 0.12), whiteMat);
    seg.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
    seg.rotation.z = a;
    group.add(seg);
  }
  group.rotation.x = -Math.PI / 2;  // 平躺在水面
  scene.add(group);
  return group;
})();
const buoyPos = new THREE.Vector2(-2.0, 1.5);

// ---------- 动画 ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  timeUniform.value = t; // 水面顶点位移、海带摇摆共用此时间

  // 渔船随浪起伏 + 侧倾
  const bh = waveHeight(boatPos.x, boatPos.y, t);
  boat.position.set(boatPos.x, WATER_TOP + bh - 0.05, boatPos.y);
  boat.rotation.y = boatHeading;
  boat.rotation.z = (waveHeight(boatPos.x + 0.4, boatPos.y, t) - waveHeight(boatPos.x - 0.4, boatPos.y, t)) * 1.4;
  boat.rotation.x = (waveHeight(boatPos.x, boatPos.y + 0.4, t) - waveHeight(boatPos.x, boatPos.y - 0.4, t)) * 1.4;

  // 救生圈漂浮打转
  const lh = waveHeight(buoyPos.x, buoyPos.y, t);
  lifebuoy.position.set(buoyPos.x, WATER_TOP + lh + 0.02, buoyPos.y);
  lifebuoy.rotation.z = t * 0.15;
  lifebuoy.rotation.x = -Math.PI / 2 + Math.sin(t * 1.1) * 0.06;

  // 鱼群游动
  for (const f of fishes) {
    const a = t * f.speed + f.phase;
    const x = f.cx + Math.cos(a) * f.rx;
    const z = f.cz + Math.sin(a) * f.rz;
    const y = f.baseY + Math.sin(t * f.bobSpeed + f.phase) * f.bobAmp;
    // 下一帧位置用于朝向
    const a2 = a + 0.08 * Math.sign(f.speed);
    const nx = f.cx + Math.cos(a2) * f.rx;
    const nz = f.cz + Math.sin(a2) * f.rz;
    f.group.position.set(x, y, z);
    f.group.lookAt(nx, y, nz);
    f.tail.rotation.y = Math.sin(t * 9 + f.phase * 3) * 0.5;
  }

  // 气泡上升
  for (const b of bubbles) {
    b.position.y += b.userData.speed * 0.016;
    b.position.x += Math.sin(t * 3 + b.position.z * 5) * 0.0015;
    if (b.position.y > WATER_TOP - 0.1) {
      b.position.y = TANK_BOTTOM + 0.3;
      b.position.x = rand(-2.4, 2.4);
      b.position.z = rand(-2.4, 2.4);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

// ---------- 自适应 ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
