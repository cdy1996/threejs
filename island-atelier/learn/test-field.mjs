/* teach-field.js 与真实 terrain.js 的一致性 + 关键数学断言。
 * 运行：node test-field.mjs */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
/* 上层 vite 工程的 package.json 带 type:module，.js 会被当 ESM 加载，
 * UMD 的 root 回退会挂。用 new Function 沙箱按 CJS 语义载入。 */
function loadCjs(rel) {
  const src = readFileSync(join(here, rel), 'utf8');
  const module = { exports: {} };
  const fn = new Function('module', 'exports', 'window', src + '\n//# sourceURL=' + rel);
  fn(module, module.exports, undefined);
  return module.exports;
}
const real = loadCjs('js/terrain.js');        // 真实模块（复刻工程原样拷贝）
const teach = loadCjs('js/teach-field.js');   // 教学复刻版（带开关）

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  -> ' + extra : '')); }
}
function near(a, b, eps, msg) { ok(Math.abs(a - b) < eps, msg, `got ${a}, want ${b}`); }

console.log('== 1. 单格圆角盒距离场（terrain.js:23-24 同公式） ==');
// 格心：qx=qz=-core -> d = 0 + (-core) - radius = -(core+radius) = -面距
near(teach.cellDistance(0, 0, 0, 0, .3525, .44), -0.7925, 1e-12, '格心深度 = -面距 -0.7925');
// 相邻格心（x=STEP=1.325）：已在 A 的面距之外 -> d = 1.325-0.7925 = 0.5325（正，外部）
near(teach.cellDistance(1.325, 0, 0, 0, .3525, .44), 0.5325, 1e-12, '相邻格心处 d = +0.5325（在 A 外部）');
// 两格中点（x=0.6625）：qx=0.31 -> d = 0.31-0.44 = -0.13（负，重叠透镜区）
near(teach.cellDistance(0.6625, 0, 0, 0, .3525, .44), -0.13, 1e-12, '两格中点 d = -0.13（重叠区只深 0.13）');
// 面距外一点点即为正（外部）
ok(teach.cellDistance(0.8, 0, 0, 0, .3525, .44) > 0, '面距 0.7925 之外 d > 0');
// 圆形对称性
near(teach.cellDistance(0.5, 0.3, 0, 0, .3525, .44), teach.cellDistance(0.3, 0.5, 0, 0, .3525, .44), 1e-12, '距离场随圆角半径各向同性');

console.log('== 2. smin 平滑最小值（terrain.js:8） ==');
near(teach.smin(-0.13, -0.13, 1e-6), -0.13, 1e-4, 'k→0 退化为 min（k=0 本身是 0/0 退化输入）');
near(teach.smin(-0.13, -0.13, .72), -0.31, 1e-12, '颈部 smin(-0.13,-0.13,.72) = -0.31（平滑后更深）');
// 搭桥能力：格距 1.7 时每格场值 0.0575
near(teach.smin(0.0575, 0.0575, .72), -0.1225, 1e-12, '间距 1.7：smin 把 0.0575 压成 -0.1225（搭桥）');
ok(Math.min(0.0575, 0.0575) > 0, '间距 1.7：min 仍为正（断开）');
// 只有 |a-b|<k 才混合
near(teach.smin(-0.5, -0.9, .2), -0.9, 1e-12, '|a-b|>k 时 smin=min=-0.9（不混合）');

console.log('== 3. teach-field 与真实 terrain.js 逐位一致（默认参数） ==');
// 复刻 app.js:67-80 的初始岛公式
const seed = 24;
function rand(n) { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453123; return s - Math.floor(s); }
function makeIsland() {
  const cells = {};
  for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
    const r = Math.sqrt(x * x * .88 + z * z * 1.08), edge = 4.15 + rand(x * 41 + z * 31) * .9;
    if (r > edge) continue;
    let h = 1;
    if (r < 3.8) h = 2;
    if ((x + 1) * (x + 1) + (z + 1.3) * (z + 1.3) < 8.2) h = 4;
    if ((x + 1.8) * (x + 1.8) + (z + 2.4) * (z + 2.4) < 1.8) h = 6;
    if (x > 1 && z > -.5 && r < 3.5) h = 3;
    if (rand(x * 9 + z * 141) > .87 && r > 3.5) continue;
    cells[x + ',' + z] = { x, z, h, green: 1 };
  }
  cells['5,2'] = { x: 5, z: 2, h: 1, green: 1 };
  cells['-4,4'] = { x: -4, z: 4, h: 1, green: 1 };
  return cells;
}
const cells = makeIsland();
const fReal = real.create(cells, seed);
const fTeach = teach.create(cells, seed); // 默认 warp=.06, blur=true
let maxDiff = 0;
for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
  const x = -8 + i * .4, z = -8 + j * .4;
  maxDiff = Math.max(maxDiff, Math.abs(fReal.height(x, z) - fTeach.height(x, z)));
}
near(maxDiff, 0, 1e-12, `1681 个采样点 height() 完全一致（maxDiff=${maxDiff}）`);
ok(fReal.max === fTeach.max && fReal.max >= 6, `最高层数一致 = ${fReal.max}`);
// sample()/surface()/biome() 也一致
const p1 = fReal.surface(1.3, -0.7), p2 = fTeach.surface(1.3, -0.7);
near(p1.y, p2.y, 1e-12, 'surface().y 一致');
near(p1.slope, p2.slope, 1e-12, 'surface().slope 一致');
ok(fReal.biome(p1, 1.3, -0.7) === fTeach.biome(p2, 1.3, -0.7), 'biome() 一致');

console.log('== 4. 高度累加：层叠等高线（terrain.js:51-53） ==');
const one = teach.create({ '0,0': { x: 0, z: 0, h: 1, green: 1 } }, 24);
near(one.height(0, 0), 0.24, 0.01, '1 层格心 ≈ -1.1+1.34 = 0.24');
const eight = teach.create({ '0,0': { x: 0, z: 0, h: 8, green: 1 } }, 24);
near(eight.height(0, 0), 0.24 + .86 * 7, 0.01, '8 层格心 ≈ 6.26');
// 每层确实贡献 ~0.86：比较 h=3 与 h=2
const h2 = teach.create({ '0,0': { x: 0, z: 0, h: 2, green: 1 } }, 24);
const h3 = teach.create({ '0,0': { x: 0, z: 0, h: 3, green: 1 } }, 24);
near(h3.height(0, 0) - h2.height(0, 0), 0.86, 0.01, '每升一层 +0.86');

console.log('== 5. 生物群系（terrain.js:61-65） ==');
ok(fTeach.biome({ y: -0.5, slope: 0 }, 0, 0) === 'water', 'y<SEA -> water');
ok(fTeach.biome({ y: 0.2, slope: 0 }, 0, 0) === 'sand', 'y<0.48 -> sand');
ok(fTeach.biome({ y: 1.0, slope: 0.1 }, 0, 0) === 'meadow', '缓坡 -> meadow');
ok(fTeach.biome({ y: 1.0, slope: 1.5 }, 0, 0) === 'cliff', '陡坡 -> cliff');

console.log('== 6. 开关确实改变输出（第 4 步对照实验的基础） ==');
const noBlur = teach.create(cells, seed, { blur: false });
const noWarp = teach.create(cells, seed, { warp: 0 });
let diffBlur = 0, diffWarp = 0;
for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) {
  const x = -6 + i * .4, z = -6 + j * .4;
  diffBlur = Math.max(diffBlur, Math.abs(fTeach.height(x, z) - noBlur.height(x, z)));
  diffWarp = Math.max(diffWarp, Math.abs(fTeach.height(x, z) - noWarp.height(x, z)));
}
ok(diffBlur > 0.01, `关闭高斯模糊后地形明显不同（maxDiff=${diffBlur.toFixed(4)}）`);
ok(diffWarp > 0.001, `关闭域扭曲后地形不同（maxDiff=${diffWarp.toFixed(4)}）`);

console.log('== 7. 相邻格连接 / 隔格断开（smin 的实际效果） ==');
const two = { '0,0': { x: 0, z: 0, h: 1, green: 1 }, '1,0': { x: 1, z: 0, h: 1, green: 1 } };
const fTwo = teach.create(two, 24);
// 相邻格中点：每格场值 -0.13，smin 后 -0.31，仍在 smoothstep 平台内 -> 与格心同高（0.24）
// 「连接」体现在海岸轮廓连续平滑，而不是中部凹陷
const neck = fTwo.height(0.6625, 0);
ok(neck > real.sea && Math.abs(neck - 0.24) < 0.05, `相邻格颈部高度 ${neck.toFixed(3)} ≈ 格心 0.24 且高于海平面（连通）`);
const skip = { '0,0': { x: 0, z: 0, h: 1, green: 1 }, '2,0': { x: 2, z: 0, h: 1, green: 1 } };
const fSkip = teach.create(skip, 24);
ok(fSkip.height(1.325, 0) < real.sea, `隔一格（距 2.65）中点高度 ${fSkip.height(1.325, 0).toFixed(3)} < 海平面（断开）`);

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
