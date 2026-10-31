# 屿生 · 掌心里的小岛（Island Atelier 复刻）

基于 Three.js 的造岛小玩具：点一下海面就长出陆地，拖着划过就连成岛屿，逐层抬升出梯田山体，再种树、引瀑布、放小船。全部几何体程序化生成，零贴图、零外部资源。

复刻自 B 站玩具「🏝️岛屿建造 / 屿生」（toy id `6xLPK3ViOtONYDHB`），地形算法与交互逻辑保持一致。

## 运行

纯静态页面，无构建依赖，两种方式任选：

```bash
# 方式一：任意静态服务器
cd island-atelier
npx serve .            # 或 python -m http.server 8080

# 方式二：直接双击 index.html（file:// 协议亦可运行）
```

## 操作

| 操作 | 效果 |
| --- | --- |
| 造陆（单指/左键点击、拖划） | 在海面或已有地形上抬高一层（最高 8 层） |
| 削低 | 削掉一层，拖划可整理海岸 |
| 植绿 | 切换/批量切换草皮，丰度在「更多」里调 |
| 装饰 | 放飞鸟（寻找山峦）、小船（环岛巡游）、瀑布（先点山体出水口，再点海面） |
| 环顾 / 右键 / Alt+拖动 | 旋转视角，滚轮或双指缩放 |
| 右侧按钮 | ↶ ↷ 旋转视角，＋ − 缩放 |
| 更多（☷） | 撤销/重做、声音、建造网格、海浪、统计、换一座岛、从一片海开始、视角归位 |

存档自动写入 localStorage（键前缀 `island-atelier:`），快捷键 `Ctrl/⌘+Z` 撤销、`Shift` 加撤销为重做，数字键 1-4 切换工具。

## 目录结构

```
island-atelier/
├── index.html            入口（UI 标记与原版一致）
├── css/
│   ├── style.css         原版主样式
│   ├── toy.css           原版安全区/视口适配（CSS 变量带回退值，脱离 SDK 可用）
│   └── replica.css       桌面端适配（宽屏放开 480px 限宽）
├── audio/                原版音频资源（背景音乐 + 6 个音效，Web Audio 播放）
└── js/
    ├── vendor/three.min.js
    ├── storage.js        本地存档垫片（替代原 B 站 toy-adapter 的 IslandStorage）
    ├── terrain.js        核心地形：分层 SDF + 平滑并集 + 高斯模糊高度场
    ├── surface-details.js 草帽、崖石唇边、草簇（对地形网格做 mask 裁剪与外扩）
    ├── waterfalls.js     瀑布路径规划（单调包络 + 逆坡检测）
    ├── boat-navigation.js 小船环岛巡游航线
    ├── decorations.js    飞鸟/小船/瀑布等装饰的放置与动画
    ├── audio.js          Web Audio 图 + <audio> 元素播放（audio/ 下资源）
    ├── feedback.js       建造反馈粒子
    ├── controls.js       轨道相机手势
    └── app.js            主程序：编辑模型、网格重建、UI、撤销栈、存档
```

## 地形原理（面试可讲版）

1. **数据模型**：整座岛是一个字典 `cells = {"x,z": {x, z, h, green}}`，`h∈[1,8]` 是高度层数，存档即 JSON。
2. **每格一个 2D 圆角盒 SDF**（`terrain.js`，格距 `STEP=1.325`，圆角半径 0.44，相邻格的面互相重叠——这是能连上的物理基础）。
3. **自动连接 = smin 平滑并集**：`smin(a,b,k)` 在两场距离差小于 k 时自动搭出平滑"脖子"，任意靠近的两块地无需拼接瓦片即融合。
4. **域扭曲 + 高斯模糊**：采样前用 sin/cos 噪声整体扭曲坐标，再对标量层做可分离高斯 `[1,4,6,4,1]/16`，抹掉"格感"。
5. **抬高 = 层叠等高线**：格子 `h` 层就把 SDF 灌入第 0..h-1 层，高度 = 各层 smoothstep 贡献叠加（第 0 层 +1.34，之上每层 +0.86），形成梯田。
6. **双线性高度场 → 网格**：113² 采样，全水下四边形剔除，顶点色按高度/坡度分 water/sand/meadow/cliff。
7. **细节全程序化**：草皮用逐顶点 mask 裁剪三角形再外扩唇边；水面是 voronoi `F2-F1` 动画加 caustics 的 shader；拾取是射线步进 + 二分。

## 与原版的差异

- 去掉 B 站外壳（性能上报、toy-sdk、service worker、iframe 重定向）；`toy-adapter` 的存储命名空间由 `js/storage.js` 等价实现。
- 其余模块（terrain / surface-details / waterfalls / boat-navigation / decorations / audio / feedback / controls / app）与线上版保持一致，仅按模块拆分为独立文件便于阅读。
- `css/replica.css` 新增桌面端宽屏适配。
