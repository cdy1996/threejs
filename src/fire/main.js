// 智慧消防大屏 - Three.js 全息大楼场景
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

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

// 内部结构：实例化楼板 + 核心筒（让玻璃后"有东西可看"）
{
  const slabGeo = new THREE.BoxGeometry(W - 0.8, 0.14, D - 0.8);
  const slabMat = new THREE.MeshBasicMaterial({
    color: 0x11386b, transparent: true, opacity: 0.5, depthWrite: false
  });
  const slabs = new THREE.InstancedMesh(slabGeo, slabMat, FLOORS);
  const m = new THREE.Matrix4();
  for (let i = 0; i < FLOORS; i++) {
    m.makeTranslation(0, floorBase(i + 1) + 0.07, 0);
    slabs.setMatrixAt(i, m);
  }
  slabs.instanceMatrix.needsUpdate = true;
  building.add(slabs);

  // 核心筒（电梯井/楼梯间剪影）
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, FLOORS * FH, 3.6),
    new THREE.MeshBasicMaterial({ color: 0x0c2a52, transparent: true, opacity: 0.45, depthWrite: false })
  );
  core.position.y = PODIUM_H + (FLOORS * FH) / 2;
  building.add(core);
  // 核心筒微光轮廓
  const coreEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(core.geometry),
    new THREE.LineBasicMaterial({ color: 0x1f7fb8, transparent: true, opacity: 0.28 })
  );
  core.add(coreEdges);
}

// 楼层分隔线
for (let i = 0; i <= FLOORS; i++) {
  const y = PODIUM_H + i * FH;
  building.add(rectOutline(W + 0.06, D + 0.06, y, COL.edge, i === 0 ? 0.7 : 0.30));
}

// 立面窗点
{
  const positions = [];
  const cols = 13, rows = FLOORS * 2; // 每层两排窗
  for (let f = 0; f < 4; f++) {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (Math.random() < 0.32) continue; // 随机镂空
        const u = -W / 2 + (c + 0.5) * (W / cols);
        const y = PODIUM_H + (r + 0.5) * (FLOORS * FH / rows);
        let x, z;
        if (f === 0) { x = u; z = D / 2 + 0.02; }
        else if (f === 1) { x = u; z = -D / 2 - 0.02; }
        else if (f === 2) { x = W / 2 + 0.02; z = u; }
        else { x = -W / 2 - 0.02; z = u; }
        positions.push(x, y, z);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const wins = new THREE.Points(geo, new THREE.PointsMaterial({
    color: COL.win, size: 0.16, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  wins.name = 'glow-windows';
  building.add(wins);
}

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
