import GUI from 'lil-gui';

// lil-gui 控制面板：所有参数实时生效，几何类参数走重建回调
export function createPanel(params, hooks) {
  const gui = new GUI({ title: '公式黑洞 · 控制面板' });

  const f1 = gui.addFolder('黑洞');
  f1.add(params.blackhole, 'radius', 0.5, 2.0, 0.01).name('视界半径').onFinishChange(hooks.rebuildBlackhole);
  f1.add(params.blackhole, 'photonRing', 0, 3, 0.01).name('光子环亮度');

  const f2 = gui.addFolder('吸积盘');
  f2.add(params.disk, 'inner', 1.2, 3.0, 0.01).name('内半径').onFinishChange(hooks.rebuildDisk);
  f2.add(params.disk, 'outer', 3.0, 9.0, 0.01).name('外半径').onFinishChange(hooks.rebuildDisk);
  f2.add(params.disk, 'brightness', 0, 3, 0.01).name('亮度');
  f2.add(params.disk, 'speed', 0, 1.5, 0.01).name('流速');
  f2.add(params.disk, 'tilt', -60, 60, 1).name('倾角°');
  f2.add(params.disk, 'temp', -1, 1, 0.01).name('色温');

  const f3 = gui.addFolder('公式层');
  f3.add(params.formulas, 'count', 0, 120, 1).name('数量').onFinishChange(hooks.rebuildFormulas);
  f3.add(params.formulas, 'scale', 0.3, 3, 0.01).name('大小').onChange(hooks.updateFormulaStyle);
  f3.add(params.formulas, 'opacity', 0, 1, 0.01).name('不透明度').onChange(hooks.updateFormulaStyle);
  f3.add(params.formulas, 'hue', 0, 360, 1).name('色相').onChange(hooks.updateFormulaStyle);
  f3.add(params.formulas, 'orbitSpeed', -0.5, 0.5, 0.005).name('公转速度');
  f3.add(params.formulas, 'dome').name('穹顶层').onChange(hooks.rebuildFormulas);

  const f4 = gui.addFolder('透镜与后期');
  f4.add(params.lens, 'strength', 0, 1.5, 0.01).name('透镜强度');
  f4.add(params.lens, 'range', 0.1, 1.2, 0.01).name('透镜范围');
  f4.add(params.lens, 'swirl', 0, 1, 0.01).name('漩涡');
  f4.add(params.bloom, 'strength', 0, 3, 0.01).name('Bloom 强度');
  f4.add(params.bloom, 'radius', 0, 1, 0.01).name('Bloom 半径');
  f4.add(params.bloom, 'threshold', 0, 1, 0.01).name('Bloom 阈值');
  f4.add(params.exposure, 'exposure', 0.2, 2.5, 0.01).name('曝光');

  const f5 = gui.addFolder('相机');
  f5.add(params.camera, 'autoRotate').name('自动环绕');
  f5.add(params.camera, 'speed', 0, 3, 0.05).name('环绕速度');
  f5.add(params.camera, 'fov', 30, 90, 1).name('FOV').onChange(hooks.updateFov);
  gui.add({ reset: hooks.resetView }, 'reset').name('重置视角');

  return gui;
}
