import * as THREE from 'three';
import { FORMULAS, createFormulaTexture } from './formulas.js';

// 公式时空面：两层绕黑洞公转的公式带
//  - band：与吸积盘共面（随倾角），模拟"公式被时空拖入盘面"
//  - dome：上方倾斜穹顶层，旋转方向相反
export class FormulaField {
  constructor(scene, params) {
    this.p = params;
    this.bandRoot = new THREE.Group();
    this.domeRoot = new THREE.Group();
    this.meshes = [];
    this.spin = 0;
    scene.add(this.bandRoot, this.domeRoot);
  }

  makeMesh(text) {
    const { texture, aspect } = createFormulaTexture(text);
    const h = 0.5;
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
    mesh.userData.baseScale = 0.75 + Math.random() * 0.9;
    return mesh;
  }

  rebuild() {
    for (const m of this.meshes) {
      m.parent.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.meshes.length = 0;

    const { count, dome } = this.p.formulas;
    const outer = this.p.disk.outer;
    const nBand = dome ? Math.ceil(count * 0.62) : count;

    for (let i = 0; i < nBand; i++) {
      const mesh = this.makeMesh(FORMULAS[i % FORMULAS.length]);
      const theta = Math.random() * Math.PI * 2;
      const r = outer * (1.05 + Math.random() * 1.35);
      mesh.position.set(r * Math.cos(theta), r * Math.sin(theta), (Math.random() - 0.5) * 0.7);
      mesh.rotation.z = theta + Math.PI / 2 + (Math.random() - 0.5) * 0.25;
      this.bandRoot.add(mesh);
      this.meshes.push(mesh);
    }

    if (dome) {
      for (let i = 0; i < count - nBand; i++) {
        const mesh = this.makeMesh(FORMULAS[(i * 7 + 3) % FORMULAS.length]);
        const theta = Math.random() * Math.PI * 2;
        const r = outer * (1.55 + Math.random() * 1.6);
        mesh.position.set(r * Math.cos(theta), r * Math.sin(theta), 1.2 + Math.random() * 2.6);
        mesh.rotation.z = theta + Math.PI / 2 + (Math.random() - 0.5) * 0.4;
        this.domeRoot.add(mesh);
        this.meshes.push(mesh);
      }
    }
    this.applyStyle();
  }

  applyStyle() {
    const { opacity, hue, scale } = this.p.formulas;
    const color = new THREE.Color().setHSL(hue / 360, 0.45, 0.78);
    for (const m of this.meshes) {
      m.material.opacity = opacity;
      m.material.color.copy(color);
      m.scale.setScalar(m.userData.baseScale * scale);
    }
  }

  update(dt) {
    this.spin += dt * this.p.formulas.orbitSpeed;
    const tilt = THREE.MathUtils.degToRad(this.p.disk.tilt);
    this.bandRoot.rotation.set(-Math.PI / 2 + tilt, 0, this.spin);
    this.domeRoot.rotation.set(-Math.PI / 2 + tilt + THREE.MathUtils.degToRad(42), 0, -this.spin * 0.6);
  }
}
