import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';

/* ============================================================
 * 青青草原 —— 全部程序化生成，不加载任何外部模型
 * 构成：渐变天空 / 起伏草甸 / 实例化草叶（风吹） / 小木屋 / 木栅栏
 * 所有可调项集中在 CONFIG，右侧面板实时生效
 * ============================================================ */

// ---------- 可配置参数 ----------
const DEFAULTS = {
  grass: { count: 34000, radius: 28, height: 0.5, width: 0.17, fold: 0.035, tilt: 0.12, minScale: 0.7, maxScale: 1.45 },
  wind: { sway: 0.08, speed: 1, gust: 0.3 },
  palette: { dark: '#4c9c31', mid: '#76c246', light: '#a8dc5c' },
  terrain: { amplitude: 1, plateauRadius: 6.5, plateauFade: 6 },
  house: { width: 4.2, height: 2.5, depth: 3.4, roofHeight: 1.55, wall: '#f3e6cf', roof: '#d2604a' },
  fence: { spacing: 1.45, height: 1.3, color: '#e3cda6' },
  env: { azimuth: 52, elevation: 45, sunIntensity: 2.1, hemiIntensity: 1.15, fogNear: 46, fogFar: 96, exposure: 1.1 },
  camera: { autoRotate: false, autoRotateSpeed: 0.5 }
};
const CONFIG = structuredClone(DEFAULTS);

const MAX_GRASS = 60000;

// ---------- 确定性随机（保证每次打开草地布局一致） ----------
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = makeRandom(20240923);

// 草叶布局只生成一次，之后调参不会重新洗牌
const grassLayout = new Float32Array(MAX_GRASS * 8);
for (let i = 0; i < MAX_GRASS; i++) {
  const o = i * 8;
  grassLayout[o] = Math.sqrt(random());          // 归一化半径（开方保证面内均匀）
  grassLayout[o + 1] = random() * Math.PI * 2;   // 方位角
  grassLayout[o + 2] = random() * Math.PI * 2;   // 绕 Y 旋转
  grassLayout[o + 3] = (random() - 0.5) * 2;     // 倾斜 X
  grassLayout[o + 4] = (random() - 0.5) * 2;     // 倾斜 Z
  grassLayout[o + 5] = random();                 // 缩放 X
  grassLayout[o + 6] = random();                 // 缩放 Y
  grassLayout[o + 7] = (random() - 0.5) * 2;     // 配色倾向 -1 深 / +1 亮
}
const usedIndex = new Int32Array(MAX_GRASS);

// ---------- 地形高度场（房子附近压平成台地） ----------
const HOUSE_AT = { x: 0, z: 0 };
let baseH = 0;

function rolling(x, z) {
  return CONFIG.terrain.amplitude * (
    Math.sin(x * 0.17) * Math.cos(z * 0.15) * 1.25 +
    Math.sin(x * 0.41 + 1.7) * Math.cos(z * 0.36 - 0.6) * 0.45 +
    Math.sin((x + z) * 0.1 + 0.4) * 0.75 +
    Math.sin(x * 0.9) * Math.cos(z * 0.85) * 0.12
  );
}
function terrainHeight(x, z) {
  const t = CONFIG.terrain;
  const d = Math.hypot(x - HOUSE_AT.x, z - HOUSE_AT.z);
  const k = THREE.MathUtils.smoothstep(d, t.plateauRadius, t.plateauRadius + t.plateauFade);
  return THREE.MathUtils.lerp(baseH, rolling(x, z), k);
}
const refreshBaseH = () => { baseH = rolling(HOUSE_AT.x, HOUSE_AT.z); };

// ---------- 渲染器 / 场景 / 相机 ----------
const container = document.getElementById('scene-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd8ecf7, CONFIG.env.fogNear, CONFIG.env.fogFar);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(13.5, 8.2, 15.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.4, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 6;
controls.maxDistance = 46;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minPolarAngle = Math.PI * 0.12;

// ---------- 灯光 ----------
const sunDir = new THREE.Vector3();
const hemi = new THREE.HemisphereLight(0xbfe4ff, 0x5f8a3a, CONFIG.env.hemiIntensity);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2cf, CONFIG.env.sunIntensity);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const bounce = new THREE.DirectionalLight(0xc8e6a0, 0.35);
bounce.position.set(-12, 6, -10);
scene.add(bounce);

// ---------- 天空穹顶（渐变 + 太阳光晕） ----------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    uTop: { value: new THREE.Color(0x4a9fe0) },
    uHorizon: { value: new THREE.Color(0xdff0fb) },
    uSunColor: { value: new THREE.Color(0xfff4d6) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uTop;
    uniform vec3 uHorizon;
    uniform vec3 uSunColor;
    uniform vec3 uSunDir;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.5, 1.0, h), 0.85));
      float s = max(dot(d, normalize(uSunDir)), 0.0);
      col += uSunColor * pow(s, 320.0) * 1.4;  // 日轮
      col += uSunColor * pow(s, 7.0) * 0.16;   // 大气光晕
      gl_FragColor = vec4(col, 1.0);
    }
  `
});
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
}

function updateSun() {
  const az = THREE.MathUtils.degToRad(CONFIG.env.azimuth);
  const el = THREE.MathUtils.degToRad(CONFIG.env.elevation);
  sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  sun.position.copy(sunDir).multiplyScalar(42);
  sun.intensity = CONFIG.env.sunIntensity;
  hemi.intensity = CONFIG.env.hemiIntensity;
  skyMat.uniforms.uSunDir.value.copy(sunDir);
}

// ---------- 起伏草甸 ----------
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
let terrainMesh = null;

function buildTerrain() {
  const SIZE = 82;
  const SEG = 108;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  // 拆成非索引几何：逐三角面上色，得到低多边形的色块感
  const flat = geo.toNonIndexed();
  geo.dispose();
  const p = flat.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const cLow = new THREE.Color(0x4f9a34);   // 低处深绿
  const cHigh = new THREE.Color(0x8fd150);  // 高处亮绿
  const cDry = new THREE.Color(0xc2cf62);   // 枯黄斑
  const tmp = new THREE.Color();
  const jitter = makeRandom(7788);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const heightMix = THREE.MathUtils.clamp((cy - baseH + 2.0) / 4.0, 0, 1);
    tmp.copy(cLow).lerp(cHigh, heightMix);
    const patch = Math.sin(cx * 0.33 + 1.2) * Math.cos(cz * 0.29 - 0.7) + Math.sin((cx - cz) * 0.19) * 0.7;
    if (patch > 0.55) tmp.lerp(cDry, (patch - 0.55) * 0.75);
    tmp.offsetHSL(0, 0, (jitter() - 0.5) * 0.05);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = tmp.r;
      colors[(i + k) * 3 + 1] = tmp.g;
      colors[(i + k) * 3 + 2] = tmp.b;
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  if (terrainMesh) {
    terrainMesh.geometry.dispose();
    terrainMesh.geometry = flat;
  } else {
    terrainMesh = new THREE.Mesh(flat, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
  }
}

// ---------- 草叶（实例化 + 顶点着色器风吹） ----------
const windUniforms = {
  uTime: { value: 0 },
  uSway: { value: CONFIG.wind.sway },
  uSpeed: { value: CONFIG.wind.speed },
  uGust: { value: CONFIG.wind.gust },
  uHeight: { value: CONFIG.grass.height }
};

// 扁平叶片：浅 V 截面 + 向上收成尖，整体只向前微倾、不卷曲
function makeBladeGeometry() {
  const h = CONFIG.grass.height;
  const w = CONFIG.grass.width;
  const fold = CONFIG.grass.fold;
  const segs = 4;
  const lean = (t) => Math.sin(t * Math.PI * 0.5) * h * 0.12;
  const pos = [];
  const idx = [];
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const k = 1 - t * 0.85;      // 收窄到叶尖的 15%，末端收成尖
    const y = h * t;
    const b = lean(t);
    const hw = w * k * 0.5;
    pos.push(-hw, y, b, 0, y, b + fold * k, hw, y, b);
  }
  const tip = pos.length / 3;
  pos.push(0, h, lean(1));
  for (let i = 0; i < segs - 1; i++) {
    const a = i * 3, m = i * 3 + 1, c = i * 3 + 2;
    const d = (i + 1) * 3, n2 = (i + 1) * 3 + 1, f = (i + 1) * 3 + 2;
    idx.push(a, m, n2, a, n2, d);   // 左半叶面
    idx.push(m, c, f, m, f, n2);    // 右半叶面
  }
  const last = (segs - 1) * 3;
  idx.push(last, last + 1, tip, last + 1, last + 2, tip);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const grassMat = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide
});
grassMat.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, windUniforms);
  shader.vertexShader = `
    uniform float uTime;
    uniform float uSway;
    uniform float uSpeed;
    uniform float uGust;
    uniform float uHeight;
  ` + shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     float phase = instanceMatrix[3][0] * 0.6 + instanceMatrix[3][2] * 0.8;
     float bend = clamp(transformed.y / uHeight, 0.0, 1.0);
     float gust = 1.0 - uGust + uGust * sin(uTime * 0.33 * uSpeed + instanceMatrix[3][0] * 0.1);
     transformed.x += sin(uTime * 1.7 * uSpeed + phase) * uSway * bend * bend * gust;
     transformed.z += cos(uTime * 1.25 * uSpeed + phase * 1.4) * uSway * 0.6 * bend * bend * gust;`
  );
};

let grass = null;

function buildGrass() {
  const geo = makeBladeGeometry();
  // 顶点色留白，真正的颜色来自 instanceColor
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  if (grass) {
    grass.geometry.dispose();
    grass.geometry = geo;
  } else {
    grass = new THREE.InstancedMesh(geo, grassMat, MAX_GRASS);
    grass.receiveShadow = true;
    grass.frustumCulled = false;   // 实例铺满整个视野，交给 GPU 更省事
    scene.add(grass);
  }
}

// 按当前参数重排所有草叶实例（位置贴合地形、数量与覆盖半径可变）
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

function refreshGrass() {
  const g = CONFIG.grass;
  const halfW = CONFIG.house.width / 2 + 0.9;
  const halfD = CONFIG.house.depth / 2 + 1.0;
  const lo = Math.min(g.minScale, g.maxScale);
  const hi = Math.max(g.minScale, g.maxScale);
  const span = hi - lo;

  let n = 0;
  for (let i = 0; i < g.count; i++) {
    const o = i * 8;
    const r = grassLayout[o] * g.radius;
    const a = grassLayout[o + 1];
    const x = HOUSE_AT.x + Math.cos(a) * r;
    const z = HOUSE_AT.z + Math.sin(a) * r;
    if (Math.abs(x - HOUSE_AT.x) < halfW && Math.abs(z - HOUSE_AT.z) < halfD) continue; // 房子占地内不长草

    dummy.position.set(x, terrainHeight(x, z) - 0.03, z);
    dummy.rotation.set(grassLayout[o + 3] * g.tilt, grassLayout[o + 2], grassLayout[o + 4] * g.tilt);
    dummy.scale.set(lo + grassLayout[o + 5] * span, lo + grassLayout[o + 6] * span, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(n, dummy.matrix);
    usedIndex[n] = i;
    n++;
  }
  grass.count = n;
  grass.instanceMatrix.needsUpdate = true;
  refreshGrassColors();
}

function refreshGrassColors() {
  const dark = new THREE.Color(CONFIG.palette.dark);
  const mid = new THREE.Color(CONFIG.palette.mid);
  const light = new THREE.Color(CONFIG.palette.light);
  for (let n = 0; n < grass.count; n++) {
    const t = grassLayout[usedIndex[n] * 8 + 7];
    tmpColor.copy(mid).lerp(t < 0 ? dark : light, Math.abs(t));
    grass.setColorAt(n, tmpColor);
  }
  grass.instanceColor.needsUpdate = true;
}

// ---------- 小木屋 ----------
const houseMats = {
  wall: new THREE.MeshStandardMaterial({ color: CONFIG.house.wall, roughness: 0.88 }),
  roof: new THREE.MeshStandardMaterial({ color: CONFIG.house.roof, roughness: 0.8 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x9a6b45, roughness: 0.85 }),
  frame: new THREE.MeshStandardMaterial({ color: 0xfbf5e9, roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9ed8ea, roughness: 0.18, metalness: 0.15 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xb6b0a2, roughness: 0.95 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xd9b25e, roughness: 0.35, metalness: 0.7 })
};
let houseGroup = null;

function buildHouse() {
  const { width: W, height: H, depth: D, roofHeight: RH } = CONFIG.house;
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.34, D + 0.3), houseMats.stone);
  base.position.y = 0.17;
  g.add(base);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), houseMats.wall);
  walls.position.y = H / 2 + 0.2;
  g.add(walls);

  const wallTop = H + 0.2;

  // 双坡屋顶：三角截面沿 Z 挤出（屋脊朝前后）
  {
    const halfW = W / 2 + 0.4;
    const depth = D + 0.8;
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, 0);
    shape.lineTo(halfW, 0);
    shape.lineTo(0, RH);
    shape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    roofGeo.translate(0, 0, -depth / 2);
    const roof = new THREE.Mesh(roofGeo, houseMats.roof);
    roof.position.y = wallTop;
    g.add(roof);

    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, depth + 0.06), houseMats.roof);
    ridge.position.y = wallTop + RH - 0.03;
    g.add(ridge);
  }

  // 烟囱
  {
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.75, 0.52), houseMats.stone);
    chimney.position.set(W * 0.3, wallTop + 0.85, -D * 0.25);
    g.add(chimney);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.14, 0.66), houseMats.roof);
    cap.position.set(W * 0.3, wallTop + 1.78, -D * 0.25);
    g.add(cap);
  }

  // 窗（默认朝 +Z，靠旋转贴到不同墙面）
  const makeWindow = (w, h) => {
    const win = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), houseMats.frame);
    win.add(frame);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w - 0.18, h - 0.18, 0.08), houseMats.glass);
    pane.position.z = 0.02;
    win.add(pane);
    const mullV = new THREE.Mesh(new THREE.BoxGeometry(0.07, h - 0.18, 0.05), houseMats.frame);
    mullV.position.z = 0.05;
    win.add(mullV);
    const mullH = new THREE.Mesh(new THREE.BoxGeometry(w - 0.18, 0.07, 0.05), houseMats.frame);
    mullH.position.z = 0.05;
    win.add(mullH);
    return win;
  };

  const frontZ = D / 2 + 0.04;
  const winY = H * 0.7;
  for (const sx of [-1, 1]) {
    const win = makeWindow(0.9, 0.9);
    win.position.set(sx * W * 0.3, winY, frontZ);
    g.add(win);
  }
  const sideX = W / 2 + 0.04;
  for (const s of [1, -1]) {
    const win = makeWindow(0.8, 0.8);
    win.position.set(s * sideX, winY, 0);
    win.rotation.y = s * Math.PI / 2;
    g.add(win);
  }

  // 门 + 门框 + 把手
  {
    const doorH = Math.min(1.8, H * 0.72);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, doorH, 0.1), houseMats.wood);
    door.position.set(0, doorH / 2 + 0.2, frontZ);
    g.add(door);

    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.12, 0.12), houseMats.frame);
    frameTop.position.set(0, doorH + 0.26, frontZ);
    g.add(frameTop);
    for (const sx of [-0.62, 0.62]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH + 0.12, 0.12), houseMats.frame);
      jamb.position.set(sx, doorH / 2 + 0.26, frontZ);
      g.add(jamb);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), houseMats.brass);
    knob.position.set(0.34, doorH / 2 + 0.2, frontZ + 0.08);
    g.add(knob);
  }

  // 门前石阶
  {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.9), houseMats.stone);
    step.position.set(0, 0.11, frontZ + 0.45);
    g.add(step);
  }

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  if (houseGroup) disposeGroup(houseGroup);
  g.position.set(HOUSE_AT.x, terrainHeight(HOUSE_AT.x, HOUSE_AT.z), HOUSE_AT.z);
  scene.add(g);
  houseGroup = g;
}

// ---------- 木栅栏 ----------
const fenceMat = new THREE.MeshStandardMaterial({ color: CONFIG.fence.color, roughness: 0.9 });
const railAxis = new THREE.Vector3(1, 0, 0);
let fenceGroups = [];

function disposeGroup(group) {
  group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  scene.remove(group);
}

function buildFence(x1, z1, x2, z2) {
  const f = CONFIG.fence;
  const group = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.17, f.height, 0.17);
  const railGeo = new THREE.BoxGeometry(1, 0.11, 0.075);

  const dx = x2 - x1;
  const dz = z2 - z1;
  const steps = Math.max(1, Math.round(Math.hypot(dx, dz) / f.spacing));

  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t;
    const z = z1 + dz * t;
    pts.push(new THREE.Vector3(x, terrainHeight(x, z), z));
  }

  for (const p of pts) {
    const post = new THREE.Mesh(postGeo, fenceMat);
    post.position.set(p.x, p.y + f.height * 0.4, p.z);
    group.add(post);
  }

  // 两根横杆：沿立柱顶点的连线倾斜，自动贴合草坡
  const dir = new THREE.Vector3();
  for (let i = 0; i < pts.length - 1; i++) {
    for (const k of [0.34, 0.7]) {
      const a = pts[i].clone().setY(pts[i].y + f.height * k);
      const b = pts[i + 1].clone().setY(pts[i + 1].y + f.height * k);
      dir.subVectors(b, a);
      const rail = new THREE.Mesh(railGeo, fenceMat);
      rail.position.copy(a).addScaledVector(dir, 0.5);
      rail.quaternion.setFromUnitVectors(railAxis, dir.clone().normalize());
      rail.scale.x = dir.length();
      group.add(rail);
    }
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(group);
  return group;
}

function buildFences() {
  for (const g of fenceGroups) disposeGroup(g);
  const gap = Math.max(2.3, CONFIG.house.width / 2 + 0.9);
  const X = 11, Z = 6.4;
  fenceGroups = [
    buildFence(-X, Z, -gap, Z),
    buildFence(gap, Z, X, Z),
    buildFence(-X, Z, -X, -2.5),
    buildFence(X, Z, X, -2.5)
  ];
}

// ---------- 环境应用 ----------
function applyEnv() {
  const e = CONFIG.env;
  scene.fog.near = e.fogNear;
  scene.fog.far = Math.max(e.fogFar, e.fogNear + 5);  // 防止 far 小于 near 导致雾失效
  renderer.toneMappingExposure = e.exposure;
  updateSun();
}

// ---------- 整体重建（地形变化后，房子/栅栏/草叶都要重新贴地） ----------
function rebuildAll() {
  refreshBaseH();
  buildTerrain();
  buildHouse();
  buildFences();
  refreshGrass();
}

// ---------- 控制面板 ----------
function createPanel() {
  const gui = new GUI({ title: '青青草原 · 参数面板' });

  const g1 = gui.addFolder('草叶');
  g1.add(CONFIG.grass, 'count', 2000, MAX_GRASS, 500).name('数量').onFinishChange(refreshGrass);
  g1.add(CONFIG.grass, 'radius', 10, 40, 1).name('覆盖半径').onFinishChange(refreshGrass);
  g1.add(CONFIG.grass, 'height', 0.2, 1.2, 0.01).name('叶高').onChange(() => {
    windUniforms.uHeight.value = CONFIG.grass.height;
    buildGrass();
  });
  g1.add(CONFIG.grass, 'width', 0.05, 0.4, 0.005).name('叶宽').onChange(buildGrass);
  g1.add(CONFIG.grass, 'fold', 0, 0.12, 0.005).name('中脊折深').onChange(buildGrass);
  g1.add(CONFIG.grass, 'tilt', 0, 0.4, 0.01).name('随机倾斜').onFinishChange(refreshGrass);
  g1.add(CONFIG.grass, 'minScale', 0.3, 1.5, 0.05).name('最小缩放').onFinishChange(refreshGrass);
  g1.add(CONFIG.grass, 'maxScale', 0.3, 2, 0.05).name('最大缩放').onFinishChange(refreshGrass);

  const g2 = gui.addFolder('风');
  g2.add(CONFIG.wind, 'sway', 0, 0.3, 0.005).name('摆幅').onChange((v) => { windUniforms.uSway.value = v; });
  g2.add(CONFIG.wind, 'speed', 0, 3, 0.05).name('速度').onChange((v) => { windUniforms.uSpeed.value = v; });
  g2.add(CONFIG.wind, 'gust', 0, 1, 0.01).name('阵风').onChange((v) => { windUniforms.uGust.value = v; });

  const g3 = gui.addFolder('草地配色');
  g3.addColor(CONFIG.palette, 'dark').name('深色').onChange(refreshGrassColors);
  g3.addColor(CONFIG.palette, 'mid').name('中间色').onChange(refreshGrassColors);
  g3.addColor(CONFIG.palette, 'light').name('亮色').onChange(refreshGrassColors);

  const g4 = gui.addFolder('地形');
  g4.add(CONFIG.terrain, 'amplitude', 0, 2.5, 0.05).name('起伏幅度').onFinishChange(rebuildAll);
  g4.add(CONFIG.terrain, 'plateauRadius', 3, 15, 0.5).name('台地半径').onFinishChange(rebuildAll);
  g4.add(CONFIG.terrain, 'plateauFade', 1, 15, 0.5).name('台地过渡').onFinishChange(rebuildAll);
  g4.close();

  const g5 = gui.addFolder('小木屋');
  g5.add(CONFIG.house, 'width', 2, 8, 0.1).name('宽度').onFinishChange(() => { buildHouse(); refreshGrass(); });
  g5.add(CONFIG.house, 'height', 1.5, 4.5, 0.1).name('墙高').onFinishChange(() => { buildHouse(); });
  g5.add(CONFIG.house, 'depth', 2, 8, 0.1).name('进深').onFinishChange(() => { buildHouse(); refreshGrass(); });
  g5.add(CONFIG.house, 'roofHeight', 0.5, 3, 0.05).name('屋顶高').onFinishChange(buildHouse);
  g5.addColor(CONFIG.house, 'wall').name('墙色').onChange((v) => houseMats.wall.color.set(v));
  g5.addColor(CONFIG.house, 'roof').name('屋顶色').onChange((v) => houseMats.roof.color.set(v));
  g5.close();

  const g6 = gui.addFolder('木栅栏');
  g6.add(CONFIG.fence, 'spacing', 0.8, 3, 0.05).name('立柱间距').onFinishChange(buildFences);
  g6.add(CONFIG.fence, 'height', 0.8, 2, 0.05).name('高度').onFinishChange(buildFences);
  g6.addColor(CONFIG.fence, 'color').name('木色').onChange((v) => fenceMat.color.set(v));
  g6.close();

  const g7 = gui.addFolder('环境');
  g7.add(CONFIG.env, 'azimuth', 0, 360, 1).name('太阳方位角').onChange(updateSun);
  g7.add(CONFIG.env, 'elevation', 10, 85, 1).name('太阳高度角').onChange(updateSun);
  g7.add(CONFIG.env, 'sunIntensity', 0, 5, 0.05).name('阳光强度').onChange(updateSun);
  g7.add(CONFIG.env, 'hemiIntensity', 0, 3, 0.05).name('天空光强度').onChange(updateSun);
  g7.add(CONFIG.env, 'fogNear', 10, 120, 1).name('雾起始').onChange(applyEnv);
  g7.add(CONFIG.env, 'fogFar', 20, 200, 1).name('雾结束').onChange(applyEnv);
  g7.add(CONFIG.env, 'exposure', 0.2, 2.5, 0.01).name('曝光').onChange(applyEnv);
  g7.close();

  const g8 = gui.addFolder('相机');
  g8.add(CONFIG.camera, 'autoRotate').name('自动环绕').onChange((v) => { controls.autoRotate = v; });
  g8.add(CONFIG.camera, 'autoRotateSpeed', 0, 3, 0.05).name('环绕速度').onChange((v) => { controls.autoRotateSpeed = v; });
  g8.close();

  gui.add({
    reset() {
      Object.assign(CONFIG.grass, DEFAULTS.grass);
      Object.assign(CONFIG.wind, DEFAULTS.wind);
      Object.assign(CONFIG.palette, DEFAULTS.palette);
      Object.assign(CONFIG.terrain, DEFAULTS.terrain);
      Object.assign(CONFIG.house, DEFAULTS.house);
      Object.assign(CONFIG.fence, DEFAULTS.fence);
      Object.assign(CONFIG.env, DEFAULTS.env);
      Object.assign(CONFIG.camera, DEFAULTS.camera);
      windUniforms.uSway.value = CONFIG.wind.sway;
      windUniforms.uSpeed.value = CONFIG.wind.speed;
      windUniforms.uGust.value = CONFIG.wind.gust;
      windUniforms.uHeight.value = CONFIG.grass.height;
      houseMats.wall.color.set(CONFIG.house.wall);
      houseMats.roof.color.set(CONFIG.house.roof);
      fenceMat.color.set(CONFIG.fence.color);
      controls.autoRotate = CONFIG.camera.autoRotate;
      controls.autoRotateSpeed = CONFIG.camera.autoRotateSpeed;
      buildGrass();
      rebuildAll();
      applyEnv();
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    }
  }, 'reset').name('恢复默认值');

  return gui;
}

// ---------- 初始化 ----------
controls.autoRotate = CONFIG.camera.autoRotate;
controls.autoRotateSpeed = CONFIG.camera.autoRotateSpeed;
refreshBaseH();
buildTerrain();
buildHouse();
buildFences();
buildGrass();
refreshGrass();
applyEnv();
createPanel();

// ---------- 动画 ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  windUniforms.uTime.value = clock.getElapsedTime();
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
