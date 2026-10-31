# 岛屿建造 · 地形生成互动教学

基于「🏝️岛屿建造」(Island Atelier) 真实源码的 8 步互动教学页，一步步讲透 SDF 地形管道的每个环节。

## 运行

```bash
# 任意静态服务器均可（ES module 无关，file:// 双击也能跑）
cd learn
python -m http.server 8322
# 打开 http://127.0.0.1:8322/index.html
```

## 八步路线

| 步骤 | 主题 | 交互实验 |
|---|---|---|
| 0 | 总览 · 地形流水线 | 六步管道与关键数字 |
| 1 | 数据模型 · cells 高度格 | 点格子建岛 / 单格 / 清空，实时统计 |
| 2 | 单格形状 · 圆角盒距离场 | 拖圆角半径，看 0.7925 > 0.6625 的重叠条件 |
| 3 | 自动连接 · smin 平滑并集 | min vs smin 左右对比，拖 k / 格距，颈部读数 |
| 4 | 有机化 · 域扭曲与高斯模糊 | 四个开关（扭曲/模糊）看「格感」如何消失 |
| 5 | 抬高地形 · 层叠等高线 | ±1 层滑块，三个视角（剖面/纵剖/smoothstep 曲线） |
| 6 | 从场到网格 · 网格化与群系 | 113² 采样与 biome 着色切换 |
| 7 | 实战 · 3D 造岛 | 真实模块驱动的完整小岛：抬高/压低/草皮/撤销/线框 |

## 文件

```
learn/
├── index.html            教学页（深色主题，左导航 + 8 步，进度存 localStorage）
├── js/
│   ├── three.min.js      原版 bundle 拆分（定制构建，无 Fog/MeshLambert/RingGeometry）
│   ├── terrain.js        真实地形模块（第 2-6 步全部公式的出处）
│   ├── controls.js       真实手势模块（第 7 步复用）
│   ├── surface-details.js 真实草帽模块（第 7 步复用）
│   └── teach-field.js    教学复刻版：与 terrain.js 逐位同公式，多两个开关
│       （域扭曲/高斯模糊可关），用于第 3-5 步的公式演示与对照
├── test-field.mjs        Node 断言：teach-field 与真实 terrain.js 在 1681 个
│                         采样点上 maxDiff=0，另校验 SDF/smin/高度累加关键数值
└── screenshots/          CDP 实测截图（每步一张 + 3D 交互后一张）
```

## 自检

页面内置 `window.__teach.check()`（12 项断言：模块加载、teach-field 与真实
terrain.js 输出一致、格心/颈部 smin 数值、各步演示与统计同步、S7 网格与草帽
生成、控制台零错误）；`window.__teach.dbgS7()` 暴露第 7 步的交互计数器
（starts/paints/selOk/hist/future），供自动化测试验证点击→拾取→撤销链路。

Node 侧回归：

```bash
node test-field.mjs   # 26/26 通过
```

## 说明

- 第 7 步的 3D 沙盘复用真实 `terrain.js` / `controls.js` / `surface-details.js`，
  材质与主工程 `app.js:36-38` 一致（`MeshStandardMaterial` + `roughness:1`）；
  悬停光标环因该 three 定制构建无 `RingGeometry`，用等价的
  `TorusGeometry(.5,.08,8,28)`（径向范围同为 0.42~0.58）。
- 第 2-6 步的公式演示全部来自 `teach-field.js`，其输出已用 Node 断言与真实
  `terrain.js` 逐点比对一致（maxDiff = 0），所见即真源码。
