// 公式黑洞 - 全局可调参数（lil-gui 面板直接绑定此对象）
export const params = {
  blackhole: {
    radius: 1.0,        // 事件视界半径
    photonRing: 1.0,    // 光子环亮度
  },
  disk: {
    inner: 1.7,         // 吸积盘内半径
    outer: 5.2,         // 吸积盘外半径
    brightness: 1.0,    // 亮度
    speed: 0.35,        // 流速
    tilt: 12,           // 倾角（度）
    temp: 0.0,          // 色温 -1(冷蓝) ~ 1(暖金)
  },
  formulas: {
    count: 40,          // 公式总数
    scale: 1.0,         // 整体大小
    opacity: 0.85,      // 不透明度
    hue: 40,            // 色相（默认暖金）
    orbitSpeed: 0.04,   // 公转速度
    dome: true,         // 是否启用上方穹顶层
  },
  lens: {
    strength: 0.6,      // 透镜强度
    range: 0.45,        // 透镜影响范围（屏幕空间）
    swirl: 0.12,        // 切向漩涡
  },
  bloom: {
    strength: 1.05,
    radius: 0.65,
    threshold: 0.0,
  },
  exposure: 1.0,
  camera: {
    autoRotate: true,
    speed: 0.5,
    fov: 50,
  },
};
