// 智慧消防大屏 - Three.js 全息大楼场景
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

/* ================= 常量 ================= */
const FLOORS = 28;          // 层数
const FH = 2;               // 层高
const W = 12, D = 12;       // 塔楼截面
const PODIUM_H = 5;         // 裙楼高
const TOWER_TOP = PODIUM_H + FLOORS * FH; // 61
const ALARM_FLOOR = 16;     // 火警楼层
const floorBase = i => PODIUM_H + (i - 1) * FH;
const floorMid = i => floorBase(i) + FH / 2;

const COL = {
  glass: 0x0a3a6a,
  edge: 0x35c8ff,
  edgeDim: 0x1a6a9a,
  win: 0x7fd8ff,
  alarm: 0xff2a3c,
  ground: 0x04102a
};

/* ================= 可调参数（控制面板） ================= */
const params = {
  edgeBrightness: 0.55,   // 线框亮度（压暗）
  edgeColor: '#35c8ff',   // 线框颜色
  facadeBrightness: 0.07, // 楼面亮度（压暗）
  innerDarkness: 0.88,    // 内部暗度
  lightCount: 50,         // 内部灯光数量
  lightBrightness: 1.0,   // 内部灯光亮度
  warmRatio: 0.25,        // 暖光比例
  showFurniture: true,    // 显示工位
  furnitureOpacity: 0.6   // 工位透明度
};

/* ================= 渲染器 ================= */
const container = document.getElementById('scene-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
document.getElementById('label-layer').appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02060f);
scene.fog = new THREE.Fog(0x02060f, 90, 220);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 500);
camera.position.set(46, 40, 52);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 24, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 35;
controls.maxDistance = 130;
controls.maxPolarAngle = Math.PI * 0.52;
controls.update();

/* ================= 灯光 ================= */
scene.add(new THREE.AmbientLight(0x3a6a9a, 1.2));
const keyLight = new THREE.DirectionalLight(0x66bbff, 1.5);
keyLight.position.set(40, 80, 30);
scene.add(keyLight);

/* ================= 工具 ================= */
function glassBox(w, h, d, opacity = 0.12) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: COL.glass, transparent: true, opacity, depthWrite: false
  }));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.55 })
  );
  mesh.add(edges);
  return mesh;
}

function rectOutline(w, d, y, color, opacity) {
  const hw = w / 2, hd = d / 2;
  const pts = [
    new THREE.Vector3(-hw, y, -hd), new THREE.Vector3(hw, y, -hd),
    new THREE.Vector3(hw, y, hd), new THREE.Vector3(-hw, y, hd)
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

function circleLine(r, color, opacity, seg = 96) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
  return line;
}

/* ================= 大楼 ================= */
const building = new THREE.Group();
scene.add(building);

// 塔楼主体（菲涅尔边缘发光幕墙）
const towerGeo = new THREE.BoxGeometry(W, FLOORS * FH, D);
const fresnelMat = new THREE.ShaderMaterial({
  uniforms: {
    uColorA: { value: new THREE.Color(0x03142c) },   // 正视时的深蓝
    uColorB: { value: new THREE.Color(0x2ec9ff) },   // 擦边时的亮青
    uPower: { value: 2.8 },
    uBase: { value: 0.10 },                          // 基础透明度
    uFloorH: { value: FH },
    uFloorOffset: { value: PODIUM_H }
  },
  vertexShader: /* glsl */`
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    void main() {
      vNormal = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uPower;
    uniform float uBase;
    uniform float uFloorH;
    uniform float uFloorOffset;
    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float fres = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), uPower);
      // 楼层分隔微光（按世界坐标取模）
      float f = fract((vWorldPos.y - uFloorOffset) / uFloorH);
      float floorLine = smoothstep(0.90, 1.0, f) * 0.35;
      vec3 color = mix(uColorA, uColorB, fres) + uColorB * floorLine;
      float alpha = uBase + fres * 0.62 + floorLine * 0.25;
      gl_FragColor = vec4(color, alpha);
    }`,
  transparent: true,
  depthWrite: false
});
const tower = new THREE.Mesh(towerGeo, fresnelMat);
const towerEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(towerGeo),
  new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.55 })
);
tower.add(towerEdges);
tower.position.y = PODIUM_H + (FLOORS * FH) / 2;
building.add(tower);

// 暗内核：挡住穿透视线，让楼体有"暗部"实体感
// 分上下两段，火警层(16F)留空，避免遮挡火焰/火花
// 注意：不能开 depthWrite，否则透明物体也会写深度，
// 把背后的幕墙和楼内灯光全部挡死，opacity 调多低都不透明
const innerMat = new THREE.MeshBasicMaterial({
  color: 0x02091a, transparent: true, opacity: params.innerDarkness, depthWrite: false
});
{
  const alarmLo = floorBase(ALARM_FLOOR), alarmHi = alarmLo + FH;
  const segments = [
    [PODIUM_H, alarmLo],              // 火警层以下
    [alarmHi, PODIUM_H + FLOORS * FH] // 火警层以上
  ];
  for (const [y0, y1] of segments) {
    const h = y1 - y0 - 0.15;
    const inner = new THREE.Mesh(new THREE.BoxGeometry(W - 1.0, h, D - 1.0), innerMat);
    inner.position.y = (y0 + y1) / 2;
    inner.renderOrder = -1; // 先画内核，幕墙后画叠加其上
    building.add(inner);
    const innerEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(inner.geometry),
      new THREE.LineBasicMaterial({ color: 0x144a7a, transparent: true, opacity: 0.22 })
    );
    inner.add(innerEdges);
  }

  // 楼板剪影：内核表面的横向暗纹，隔着玻璃若隐若现
  const slabGeo = new THREE.BoxGeometry(W - 0.9, 0.1, D - 0.9);
  const slabMat = new THREE.MeshBasicMaterial({
    color: 0x0a2246, transparent: true, opacity: 0.35, depthWrite: false
  });
  const slabs = new THREE.InstancedMesh(slabGeo, slabMat, FLOORS);
  const m = new THREE.Matrix4();
  for (let i = 0; i < FLOORS; i++) {
    m.makeTranslation(0, floorBase(i + 1) + 0.05, 0);
    slabs.setMatrixAt(i, m);
  }
  slabs.instanceMatrix.needsUpdate = true;
  building.add(slabs);
}

// 楼层分隔线
for (let i = 0; i <= FLOORS; i++) {
  const y = PODIUM_H + i * FH;
  building.add(rectOutline(W + 0.06, D + 0.06, y, COL.edge, i === 0 ? 0.7 : 0.30));
}

// 楼内灯光：随机分布在塔楼内部的光点（隔着玻璃看到的室内灯）
let interiorLights = null;
function buildInteriorLights() {
  if (interiorLights) {
    building.remove(interiorLights);
    interiorLights.geometry.dispose();
    interiorLights.material.dispose();
  }
  const n = Math.round(params.lightCount);
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const phases = new Float32Array(n);
  const speeds = new Float32Array(n);
  const cCool = new THREE.Color(0x9fdcff);
  const cWarm = new THREE.Color(0xffd9a0);
  for (let i = 0; i < n; i++) {
    // 随机分布在塔身内部体积中（留出幕墙厚度）
    positions[i * 3] = (Math.random() - 0.5) * (W - 2.4);
    positions[i * 3 + 1] = PODIUM_H + 0.6 + Math.random() * (FLOORS * FH - 1.2);
    positions[i * 3 + 2] = (Math.random() - 0.5) * (D - 2.4);
    const col = (Math.random() < params.warmRatio ? cWarm : cCool).clone()
      .multiplyScalar(0.5 + Math.random() * 0.5);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.2 + Math.random() * 0.6; // 缓慢呼吸
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBrightness: { value: params.lightBrightness }
    },
    vertexShader: /* glsl */`
      attribute vec3 aColor;
      attribute float aPhase;
      attribute float aSpeed;
      varying vec3 vColor;
      uniform float uTime;
      uniform float uBrightness;
      void main() {
        float breathe = 0.78 + 0.22 * sin(uTime * aSpeed + aPhase);
        vColor = aColor * breathe * uBrightness;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 3.0 * (120.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      void main() {
        // 圆形光点，柔和光晕
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.12, d);
        gl_FragColor = vec4(vColor, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  interiorLights = new THREE.Points(geo, mat);
  interiorLights.name = 'glow-windows';
  interiorLights.layers.enable(1); // BLOOM_LAYER
  building.add(interiorLights);
}
buildInteriorLights();

// 楼层工位：每层排列办公桌椅（桌=长方体，椅=圆柱），隔着玻璃增加真实感
const furniture = new THREE.Group();
{
  const ROWS_Z = [-3.0, 0, 3.0];        // 三排
  const COLS_X = [-4.0, -1.4, 1.4, 4.0]; // 每排四个工位
  const PER_FLOOR = ROWS_Z.length * COLS_X.length;
  const TOTAL = PER_FLOOR * FLOORS;

  const deskMat = new THREE.MeshBasicMaterial({
    color: 0x1a3f6e, transparent: true, opacity: params.furnitureOpacity, depthWrite: false
  });
  const chairMat = new THREE.MeshBasicMaterial({
    color: 0x14304f, transparent: true, opacity: params.furnitureOpacity, depthWrite: false
  });
  furniture.userData.mats = [deskMat, chairMat];

  const desks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 0.5, 0.6), deskMat, TOTAL);
  const chairs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.24, 0.42, 10), chairMat, TOTAL);

  const m = new THREE.Matrix4();
  let idx = 0;
  for (let f = 1; f <= FLOORS; f++) {
    const baseY = floorBase(f);
    for (const z of ROWS_Z) {
      for (const x of COLS_X) {
        // 桌面中心（桌高 0.5）
        m.makeTranslation(x, baseY + 0.25, z);
        desks.setMatrixAt(idx, m);
        // 椅子放在桌子朝向走道的一侧
        const side = z <= 0 ? 1 : -1;
        m.makeTranslation(x, baseY + 0.21, z + side * 0.68);
        chairs.setMatrixAt(idx, m);
        idx++;
      }
    }
  }
  desks.instanceMatrix.needsUpdate = true;
  chairs.instanceMatrix.needsUpdate = true;
  furniture.add(desks, chairs);
}
building.add(furniture);

// 顶部设备层（皇冠）
const crown1 = glassBox(8, 4, 8, 0.14); crown1.position.y = TOWER_TOP + 2; building.add(crown1);
const slab = glassBox(10.5, 0.8, 10.5, 0.16); slab.position.y = TOWER_TOP + 0.4; building.add(slab);
const crown2 = glassBox(5, 2.5, 5, 0.16); crown2.position.y = TOWER_TOP + 5.2; building.add(crown2);
// 顶部光圈
const beacon = circleLine(3.4, COL.edge, 0.8);
beacon.position.y = TOWER_TOP + 6.6;
building.add(beacon);

// 裙楼
const podium = glassBox(24, PODIUM_H, 24, 0.10);
podium.position.y = PODIUM_H / 2;
building.add(podium);
building.add(rectOutline(24.06, 24.06, PODIUM_H / 2, COL.edge, 0.25));
// 裙楼外圈矮墙
const base2 = glassBox(30, 1.6, 30, 0.08);
base2.position.y = 0.8;
building.add(base2);

/* ================= 16F 火警 ================= */
const alarmY = floorMid(ALARM_FLOOR);
const alarmBox = new THREE.Mesh(
  new THREE.BoxGeometry(W + 0.4, FH, D + 0.4),
  new THREE.MeshBasicMaterial({ color: COL.alarm, transparent: true, opacity: 0.22, depthWrite: false })
);
alarmBox.position.y = alarmY;
const alarmEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(alarmBox.geometry),
  new THREE.LineBasicMaterial({ color: 0xff6673, transparent: true, opacity: 0.9 })
);
alarmBox.add(alarmEdges);
building.add(alarmBox);

const alarmLight = new THREE.PointLight(COL.alarm, 60, 40, 1.8);
alarmLight.position.set(0, alarmY + 1, 0);
building.add(alarmLight);

// 火焰纹理（Canvas 径向渐变）
function makeFlameTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 84, 4, 64, 84, 60);
  g.addColorStop(0, 'rgba(255,240,180,1)');
  g.addColorStop(0.25, 'rgba(255,160,60,0.9)');
  g.addColorStop(0.55, 'rgba(255,70,40,0.5)');
  g.addColorStop(1, 'rgba(255,40,30,0)');
  ctx.fillStyle = g;
  // 火焰形状：上尖下圆
  ctx.beginPath();
  ctx.moveTo(64, 6);
  ctx.bezierCurveTo(92, 50, 108, 74, 108, 92);
  ctx.bezierCurveTo(108, 116, 88, 126, 64, 126);
  ctx.bezierCurveTo(40, 126, 20, 116, 20, 92);
  ctx.bezierCurveTo(20, 74, 36, 50, 64, 6);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const flameTex = makeFlameTexture();
const flames = [];
for (let i = 0; i < 6; i++) {
  const mat = new THREE.SpriteMaterial({
    map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const s = new THREE.Sprite(mat);
  const ang = (i / 6) * Math.PI * 2;
  s.position.set(Math.cos(ang) * 3.2, alarmY - 0.4, Math.sin(ang) * 3.2);
  s.scale.setScalar(2.2);
  s.userData = { phase: Math.random() * Math.PI * 2, base: 1.8 + Math.random() * 1.2 };
  building.add(s);
  flames.push(s);
}

// 上升火花粒子
const SPARKS = 90;
const sparkGeo = new THREE.BufferGeometry();
const sparkPos = new Float32Array(SPARKS * 3);
const sparkVel = [];
for (let i = 0; i < SPARKS; i++) {
  sparkPos[i * 3] = (Math.random() - 0.5) * 8;
  sparkPos[i * 3 + 1] = alarmY - 1 + Math.random() * 4;
  sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 8;
  sparkVel.push(0.03 + Math.random() * 0.09);
}
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
  color: 0xffa050, size: 0.28, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false
}));
building.add(sparks);

// 火警层光环
const alarmRing = circleLine(9, COL.alarm, 0.8);
alarmRing.position.y = alarmY;
building.add(alarmRing);

/* ================= 楼层标签 ================= */
const labelX = -(W / 2 + 2.2);
for (let i = 1; i <= FLOORS; i++) {
  const div = document.createElement('div');
  div.className = 'floor-label' + (i === ALARM_FLOOR ? ' alarm' : '');
  div.textContent = i + 'F';
  const obj = new CSS2DObject(div);
  obj.position.set(labelX, floorMid(i), 0);
  building.add(obj);
}
{
  const div = document.createElement('div');
  div.className = 'floor-label';
  div.textContent = 'RF';
  const obj = new CSS2DObject(div);
  obj.position.set(labelX, TOWER_TOP + 2, 0);
  building.add(obj);
}
// 标签竖向引导线
{
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(labelX + 1, PODIUM_H, 0),
    new THREE.Vector3(labelX + 1, TOWER_TOP + 3.4, 0)
  ]);
  building.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.35 })));
}

/* ================= 地面与环境 ================= */
// 地面
{
  const g = new THREE.Mesh(
    new THREE.CircleGeometry(90, 64),
    new THREE.MeshBasicMaterial({ color: COL.ground })
  );
  g.rotation.x = -Math.PI / 2;
  g.position.y = -0.05;
  scene.add(g);
}
// 网格
{
  const grid = new THREE.GridHelper(180, 36, 0x1a4a7a, 0x0c2440);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.position.y = 0;
  scene.add(grid);
}
// 楼底广场环
const plaza1 = circleLine(20, COL.edge, 0.5); plaza1.position.y = 0.06; scene.add(plaza1);
const plaza2 = circleLine(24, COL.edge, 0.25); plaza2.position.y = 0.06; scene.add(plaza2);
// 六边形装饰
{
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    pts.push(new THREE.Vector3(Math.cos(a) * 16.5, 0.06, Math.sin(a) * 16.5));
  }
  scene.add(new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.4 })
  ));
}
// 雷达扫描环（扩散动画）
const scanRings = [];
for (let i = 0; i < 2; i++) {
  const ring = circleLine(1, COL.edge, 0.6);
  ring.position.y = 0.08;
  ring.userData = { t: i * 0.5 };
  scene.add(ring);
  scanRings.push(ring);
}

// 周围配楼
const neighbors = new THREE.Group();
{
  const spots = [
    [30, 8, 6, 18], [-32, 10, 8, 14], [26, -26, 10, 22], [-24, -30, 7, 12],
    [44, 18, 9, 26], [-44, -8, 8, 18], [12, -44, 9, 16], [-10, 42, 8, 20],
    [48, -14, 6, 10], [-40, 30, 7, 13]
  ];
  for (const [x, z, s, h] of spots) {
    const b = glassBox(s, h, s, 0.05);
    b.children[0].material.opacity = 0.22; // 线框更暗
    b.position.set(x, h / 2, z);
    neighbors.add(b);
    // 顶部亮线
    const top = rectOutline(s + 0.05, s + 0.05, 0, COL.edge, 0.3);
    top.position.set(x, h, z);
    neighbors.add(top);
  }
}
scene.add(neighbors);

// 漂浮尘埃
const DUST = 320;
let dust;
{
  const pos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    const r = 15 + Math.random() * 60;
    const a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 70;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x4fa8e0, size: 0.3, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(dust);
}

// 全息扫描带（沿塔身向上扫）
const scanBand = new THREE.Mesh(
  new THREE.BoxGeometry(W + 0.6, 0.5, D + 0.6),
  new THREE.MeshBasicMaterial({
    color: COL.edge, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
);
scanBand.position.y = PODIUM_H;
building.add(scanBand);

/* ================= 线框统一调控 ================= */
// 收集所有青色线框材质（大楼轮廓/楼层线/信标等，不含红色报警）
const edgeMats = [];
{
  const seen = new Set();
  const collect = root => root.traverse(o => {
    if ((o.isLine || o.isLineSegments || o.isLineLoop) &&
        o.material.color && o.material.color.getHex() === COL.edge && !seen.has(o.material)) {
      seen.add(o.material);
      edgeMats.push({ mat: o.material, base: o.material.opacity ?? 1 });
    }
  });
  collect(building);
  collect(scene);
}
function applyEdges() {
  const c = new THREE.Color(params.edgeColor);
  for (const e of edgeMats) {
    e.mat.color.copy(c);
    e.mat.opacity = e.base * params.edgeBrightness;
  }
}
applyEdges();
fresnelMat.uniforms.uBase.value = params.facadeBrightness;

/* ================= 控制面板 ================= */
{
  const gui = new GUI({ title: '大楼外观控制' });
  gui.add(params, 'edgeBrightness', 0, 1.2, 0.01).name('线框亮度').onChange(applyEdges);
  gui.addColor(params, 'edgeColor').name('线框颜色').onChange(applyEdges);
  gui.add(params, 'facadeBrightness', 0.02, 0.30, 0.005).name('楼面亮度')
    .onChange(v => { fresnelMat.uniforms.uBase.value = v; });
  gui.add(params, 'innerDarkness', 0.05, 0.98, 0.01).name('内部暗度(越小越透明)')
    .onChange(v => { innerMat.opacity = v; });
  gui.add(params, 'lightCount', 0, 300, 1).name('灯光数量').onChange(buildInteriorLights);
  gui.add(params, 'lightBrightness', 0, 3, 0.05).name('灯光亮度')
    .onChange(v => { interiorLights.material.uniforms.uBrightness.value = v; });
  gui.add(params, 'warmRatio', 0, 1, 0.01).name('暖光比例').onChange(buildInteriorLights);
  gui.add(params, 'showFurniture').name('显示工位').onChange(v => { furniture.visible = v; });
  gui.add(params, 'furnitureOpacity', 0.1, 1, 0.02).name('工位透明度')
    .onChange(v => { for (const mt of furniture.userData.mats) mt.opacity = v; });
}

/* ================= 选择性泛光（只让发光体过 Bloom） ================= */
const BLOOM_LAYER = 1;
const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_LAYER);

// 把需要发光的对象加入 bloom 图层
{
  const glow = [towerEdges, alarmBox, alarmRing, beacon, scanBand, plaza1, plaza2, sparks, ...flames, ...scanRings];
  for (const o of glow) o.traverse(c => c.layers.enable(BLOOM_LAYER));
  building.traverse(o => { if (o.name === 'glow-windows') o.layers.enable(BLOOM_LAYER); });
}

const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.2, 0.7, 0.15);

// bloom 通道：离屏渲染，只提取发光体
const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(renderScene);
bloomComposer.addPass(bloomPass);

// 最终通道：原画面 + bloom 叠加
const finalPass = new ShaderPass(
  new THREE.ShaderMaterial({
    uniforms: {
      baseTexture: { value: null },
      bloomTexture: { value: bloomComposer.renderTarget2.texture }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D baseTexture;
      uniform sampler2D bloomTexture;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
      }`
  }),
  'baseTexture'
);
finalPass.needsSwap = true;

const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(renderScene);
finalComposer.addPass(finalPass);
finalComposer.addPass(new OutputPass());

// bloom 通道渲染前隐藏非发光物体（有发光子级的父节点除外）
const hiddenCache = [];
function hideNonBloomed(obj) {
  if (!(obj.isMesh || obj.isLine || obj.isPoints || obj.isSprite)) return;
  if (bloomLayer.test(obj.layers)) return;
  let childGlows = false;
  for (const c of obj.children) {
    let g = false;
    c.traverse(o => { if (bloomLayer.test(o.layers)) g = true; });
    if (g) { childGlows = true; break; }
  }
  if (!childGlows && obj.visible) { hiddenCache.push(obj); obj.visible = false; }
}

/* ================= 动画 ================= */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // 火焰跳动
  for (const f of flames) {
    const p = f.userData.phase;
    const s = f.userData.base * (1 + 0.22 * Math.sin(t * 9 + p) + 0.12 * Math.sin(t * 23 + p * 2));
    f.scale.set(s, s * (1.15 + 0.15 * Math.sin(t * 13 + p)), 1);
    f.material.opacity = 0.75 + 0.25 * Math.sin(t * 11 + p * 3);
  }
  // 火花上升
  {
    const arr = sparkGeo.attributes.position.array;
    for (let i = 0; i < SPARKS; i++) {
      arr[i * 3 + 1] += sparkVel[i];
      arr[i * 3] += Math.sin(t * 3 + i) * 0.006;
      if (arr[i * 3 + 1] > alarmY + 6) {
        arr[i * 3] = (Math.random() - 0.5) * 8;
        arr[i * 3 + 1] = alarmY - 1;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 8;
      }
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }
  // 报警层脉冲
  alarmBox.material.opacity = 0.16 + 0.10 * Math.sin(t * 4);
  alarmEdges.material.opacity = 0.6 + 0.35 * Math.sin(t * 4);
  alarmLight.intensity = 50 + 25 * Math.sin(t * 6);
  alarmRing.scale.setScalar(1 + 0.06 * Math.sin(t * 4));
  alarmRing.material.opacity = 0.5 + 0.3 * Math.sin(t * 4);

  // 雷达扫描环
  for (const ring of scanRings) {
    ring.userData.t = (ring.userData.t + 0.004) % 1;
    const k = ring.userData.t;
    ring.scale.setScalar(20 + k * 55);
    ring.material.opacity = 0.55 * (1 - k);
  }
  // 塔身扫描带
  scanBand.position.y = PODIUM_H + ((t * 4) % (FLOORS * FH));
  // 楼内灯光呼吸
  interiorLights.material.uniforms.uTime.value = t;
  // 顶部信标旋转呼吸
  beacon.rotation.y = t * 0.8;
  beacon.material.opacity = 0.5 + 0.3 * Math.sin(t * 2);
  // 尘埃漂浮
  dust.rotation.y = t * 0.02;
  // 建筑整体微浮（全息感）
  building.position.y = Math.sin(t * 0.8) * 0.15;

  controls.update();
  // 1) 隐藏非发光体 → 渲染 bloom 通道（离屏）
  hiddenCache.length = 0;
  scene.traverse(hideNonBloomed);
  bloomComposer.render();
  // 2) 恢复可见性 → 渲染最终画面（原图 + bloom 叠加）
  for (const o of hiddenCache) o.visible = true;
  finalComposer.render();
  labelRenderer.render(scene, camera);
}
animate();

/* ================= 自适应 ================= */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  bloomComposer.setSize(innerWidth, innerHeight);
  finalComposer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});
