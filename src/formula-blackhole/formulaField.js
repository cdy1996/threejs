import * as THREE from 'three';
import { FORMULAS, createFormulaTexture } from './formulas.js';

// 公式光带：若干条螺旋光带从外空盘旋汇聚、贴到吸积盘外缘；
// 公式沿光带走向依次排布、沿切线方向书写，光带本身是发光飘带。
export class FormulaField {
  constructor(scene, params) {
    this.p = params;
    this.root = new THREE.Group(); // 随吸积盘倾角倾斜 + 整体缓慢公转
    this.meshes = [];
    this.ribbons = [];
    this.spin = 0;
    scene.add(this.root);
  }

  // 光带 b 上参数 t∈[0,1] 处的点（root 局部坐标，z 为盘面法向）
  // t=0 在外空高处，t=1 贴到吸积盘外缘
  bandPoint(t, b) {
    const { outer } = this.p.disk;
    const rStart = outer * (2.35 - 0.22 * b);
    const rEnd = outer * 1.02;
    const hStart = outer * (0.55 - 0.09 * b);
    const turns = 1.1 + 0.16 * b;
    const theta = b * 2.39996 + t * turns * Math.PI * 2; // 黄金角错开各条光带
    const r = rStart + (rEnd - rStart) * Math.pow(t, 1.15);
    const z = hStart * Math.pow(1 - t, 1.6) + 0.06;
    return { x: r * Math.cos(theta), y: r * Math.sin(theta), z, theta };
  }

  makeMesh(text) {
    const { texture, aspect } = createFormulaTexture(text);
    const h = 0.8;
    const geo = new THREE.PlaneGeometry(h * aspect, h);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      opacity: this.p.formulas.opacity,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.baseScale = 0.75 + Math.random() * 0.5;
    return mesh;
  }

  rebuild() {
    for (const m of this.meshes) {
      if (m.parent) m.parent.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.meshes.length = 0;
    for (const rb of this.ribbons) {
      if (rb.parent) rb.parent.remove(rb);
      rb.geometry.dispose();
      rb.material.dispose();
    }
    this.ribbons.length = 0;

    const { count, bands, hue } = this.p.formulas;
    const per = Math.max(2, Math.round(count / bands));
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(hue / 360, 0.6, 0.55),
      transparent: true,
      opacity: 0.28 * this.p.formulas.ribbon,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    for (let b = 0; b < bands; b++) {
      // 发光飘带
      const pts = [];
      for (let s = 0; s <= 140; s++) {
        const p = this.bandPoint(s / 140, b);
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.028, 5, false), ribbonMat);
      this.root.add(ribbon);
      this.ribbons.push(ribbon);

      // 公式沿光带依次排布，沿切线方向书写
      for (let i = 0; i < per; i++) {
        const t = (i + 0.5) / per;
        const p = this.bandPoint(t, b);
        const mesh = this.makeMesh(FORMULAS[(b * 7 + i * 3) % FORMULAS.length]);
        mesh.position.set(p.x, p.y, p.z + 0.02);
        // 沿光带切向书写；越贴近盘面越放平（跟随光带俯角）
        const lean = 1.15 - 0.6 * t;
        mesh.rotation.set(lean, 0, p.theta + Math.PI / 2);
        this.root.add(mesh);
        this.meshes.push(mesh);
      }
    }
    this.applyStyle();
  }

  applyStyle() {
    const { opacity, hue, scale, ribbon } = this.p.formulas;
    const color = new THREE.Color().setHSL(hue / 360, 0.45, 0.78);
    const rc = new THREE.Color().setHSL(hue / 360, 0.6, 0.55);
    for (const m of this.meshes) {
      m.material.opacity = opacity;
      m.material.color.copy(color);
      m.scale.setScalar(m.userData.baseScale * scale);
    }
    for (const rb of this.ribbons) {
      rb.material.color.copy(rc);
      rb.material.opacity = 0.28 * ribbon;
    }
  }

  update(dt) {
    this.spin += dt * this.p.formulas.orbitSpeed;
    const tilt = THREE.MathUtils.degToRad(this.p.disk.tilt);
    this.root.rotation.set(-Math.PI / 2 + tilt, 0, this.spin);
  }
}
