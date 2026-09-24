---
name: headless-shot
description: 用无头 Chrome 给网页截图，或提取页面渲染后的 DOM 与计算样式，用来目视验证前端改动（布局错位、CSS 冲突、元素被遮挡、尺寸位置、3D 画面是否出图）。当需要确认页面真实渲染结果、排查样式或着色器问题时使用。
argument-hint: [url] [out.png]
allowed-tools: Bash(bash ${CLAUDE_SKILL_DIR}/shot.sh *) Bash(timeout *) Bash(curl *) Bash(date *)
---

# 无头浏览器截图与 DOM 探针

用于**自己确认页面渲染结果**，而不是改完代码就声称完成。改前端后应当先截图看一眼。

## 前置：dev server 必须在跑

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5173/   # 期望 200
# 没跑的话（注意本项目用 pnpm）：
pnpm dev > /tmp/vite-dev.log 2>&1 &
```

## 一、截图

```bash
bash ${CLAUDE_SKILL_DIR}/shot.sh <url> <输出.png> [宽,高] [等待毫秒]
# 例
bash ${CLAUDE_SKILL_DIR}/shot.sh http://127.0.0.1:5173/grassland.html F:/code/threejs/a.png 1280,720 2000
```

然后用 **Read 工具读取那张 PNG**（Claude 能直接看图），据实际画面判断，不要凭想象。

要点：
- 输出路径写 Windows 形式 `F:/code/threejs/x.png`；脚本内部会用 `cygpath -m` 转换，但直接手敲命令时要注意，Git Bash 的 `/f/...` 形式 Chrome 不认。
- **Read 工具读不了 `/tmp/...`**。`/tmp` 实际是 `C:\Users\13867\AppData\Local\Temp`，Read 需要 Windows 路径，即 `C:/Users/13867/AppData/Local/Temp/x.png`。图省事就直接输出到仓库目录再删。
- 脚本自带 `timeout`（默认 60s，可用 `SHOT_TIMEOUT` 调）。无头 Chrome 在本机偶发挂死不退出，**手敲命令时务必自己套 `timeout`**。
- 本机跑 three.js 页面很慢（见第二节），3D 页面请把超时放到 300s。

## 二、本机性能：慢，但能出图（实测数据）

**无头 Chrome 能正常渲染本项目的 WebGL 页面**，只是软件光栅化（SwiftShader）慢。同一批命令（1280×720、budget 2000、串行执行）跑全工程 6 个页面的实测：

| 页面 | 耗时 |
|---|---|
| `index.html`（鱼缸） | 2s |
| `blackhole.html` | 3s |
| `aquarium.html` | 15s |
| `fire.html` | 68s |
| `grassland.html` | 70s |
| `formula-blackhole.html` | 150s |

两点要注意：

1. **耗时取决于场景本身**（着色器复杂度、渲染 pass 数、像素数），页与页之间差几十倍。没有"这个工程很慢"这回事，得逐页量。
2. **单次测量的噪声很大**。`grassland.html` 早先测出 400×250 要 119~148s、1400×900 超时，这轮 1280×720（像素数是 400×250 的 9 倍）却只用 70s——多半是先前有其它进程在抢 CPU。**别把某一次的数字当常量，也别据此下"这页截不了"的结论。**

因此处方是：

- **直接用 1280×720**，图够看，不必为了省时间缩到很小。
- **超时给足**：`SHOT_TIMEOUT=300`，或手敲时套 `timeout 300`。最慢的页面 150s，留一倍余量。
- **串行跑**：SwiftShader 吃满 CPU，并行只会互相拖慢，还可能把本来能过的页面拖到超时。
- budget 2000 足够页面初始化。`--virtual-time-budget` 会快进定时器，页面里的 `requestAnimationFrame` 渲染循环因此会执行多帧，每帧重新光栅化一遍，所以 budget 不必给大。

若某次确实超时没出图，先重跑一次（可能是噪声），仍失败再缩小窗口；确实没截到就如实告诉用户这一项没验证到，别假装看过。

## 三、DOM 与计算样式探针（排查布局/样式冲突的主力手段）

截图只能看出"不对"，探针能定位"为什么不对"。

在临时页里往 `document.body` 插一个信息块，用 `--dom` 把渲染后的 HTML 导出来读：

```html
<pre id="__probe"></pre>
<script>
  const lines = [];
  const el = document.querySelector('要查的元素');
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  lines.push(`rect y=${r.y} h=${r.height} pos=${s.position} top=${s.top} order=${s.order}`);
  [...el.children].forEach((c, i) => {
    const b = c.getBoundingClientRect(), cs = getComputedStyle(c);
    lines.push(`[${i}] .${c.className} y=${b.y} h=${b.height} pos=${cs.position} top=${cs.top}`);
  });
  document.getElementById('__probe').textContent = lines.join('\n');
</script>
```

```bash
bash ${CLAUDE_SKILL_DIR}/shot.sh --dom <url> \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      const m=s.match(/<pre id=\"__probe\">([\s\S]*?)<\/pre>/);
      console.log(m?m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'):'未找到探针');
    });"
```

实测案例：本项目 `grassland.html` 的参数面板标题栏压住了"覆盖半径"一行。截图只看到错位，探针一次给出根因——

```
[0] .title    y=49  pos=fixed top=26px    ← 面板标题栏被抽出了文档流
[1] .children y=23  pos=static            ← 内容顶到面板最上沿
```

原因是页面里写了裸类选择器 `.title { position: fixed; ... }`，而 lil-gui 的面板/分组标题栏类名也叫 `.title`。**裸类名与第三方库撞名是这类"元素跑位"的常见原因**，查的时候先怀疑这个。

## 四、3D 画面空白？用 `--dump-dom` 抓着色器编译错误

截图全白/纯背景色时，**先别怀疑"无头不支持 WebGL"**——按第二节，WebGL 是支持的。更常见的原因是**自定义着色器编译失败**，该物体整个不画，画面就只剩背景色。

`onBeforeCompile` 里注入 GLSL 尤其容易踩：往 `shader.vertexShader` 前面拼 uniform 声明时**必须带换行**，否则会和原有的 `#define STANDARD` 挤到同一行，`#` 不在行首 → `ERROR: '#' : invalid character`：

```js
// ✗ 错：uniform 声明与 #define STANDARD 连成一行
shader.vertexShader = `uniform float uTime;` + shader.vertexShader.replace(...);

// ✓ 对：模板串本身带换行（多行写法天然带）
shader.vertexShader = `
  uniform float uTime;
` + shader.vertexShader.replace(...);
```

把 console 错误捞进探针就能直接看到编译报错原文：

```html
<script>
  window.__errs = [];
  window.onerror = (m) => { window.__errs.push('onerror: ' + m); };
  const _ce = console.error;
  console.error = (...a) => { window.__errs.push('console.error: ' + a.join(' ').slice(0, 900)); _ce(...a); };
</script>
<script type="module">
  /* ...建场景... */
  try { renderer.render(scene, camera); } catch (e) { window.__errs.push('render: ' + e.message); }
  document.getElementById('__probe').textContent =
    'drawCalls=' + renderer.info.render.calls
    + ' triangles=' + renderer.info.render.triangles
    + ' programs=' + renderer.info.programs.length
    + '\nERRORS:\n' + (window.__errs.join('\n---\n') || '(无)');
</script>
```

用第三节的 `--dom` 命令导出即可。探针里 `drawCalls=1 / triangles=476000` 说明物体进了渲染队列，问题在着色器；`drawCalls=0` 则说明物体压根没提交（材质、可见性、包围盒剔除之类）。

## 五、隔离复现页

要查的是 DOM/CSS，或想把某个性能因子单独拎出来量，写一张只保留必要部分的临时页。Vite 在 HTML 的 `<script type="module">` 里能解析裸模块名，可直接引库：

```html
<script type="module">
import * as THREE from 'three';
import GUI from 'three/addons/libs/lil-gui.module.min.js';   // Vite 会解析
/* 只重建要测的那部分，例如只开阴影、或只放 instanced 叶片 */
</script>
```

放在项目根目录即可被 dev server 直接访问（如 `http://127.0.0.1:5173/_check.html`）。

## 六、收尾

临时页、PNG、探针脚本**用完必须删掉**，不要留在仓库里：

```bash
rm -f _check.html _t_shadow.html _t_inst.html .panel.png
```

## 常见坑速查

| 现象 | 原因 |
|---|---|
| 命令挂住不返回 | 超时给太小（3D 页面要 300s）；或输出路径不是 Windows 形式 |
| 元素位置莫名其妙 | 裸类选择器与第三方库撞名（`.title` `.children` `.controller` 等） |
| 截图里文字看不见 | 第三方库的 CSS 变量默认值是为深色底设计的，换浅色底要一并覆盖文字色 |
| 3D 画面全白/纯背景色 | 多半是自定义着色器编译失败，按第四节抓 `console.error`，别怪无头浏览器 |
| Read 读不了截图 | 图在 `/tmp`，得用 `C:/Users/13867/AppData/Local/Temp/...` |
