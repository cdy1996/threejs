import * as THREE from 'three';

// 星空背景：两层不同大小的星点，带轻微透明度差异
export function createStarfield(count = 2800) {
  const group = new THREE.Group();

  const makeLayer = (n, size, color, opacity) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 160 + Math.random() * 260;
      const t = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(t);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(t);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color, size, sizeAttenuation: true,
      transparent: true, opacity, depthWrite: false,
    });
    group.add(new THREE.Points(geo, mat));
  };

  makeLayer(Math.floor(count * 0.75), 1.0, 0xdfe6ff, 0.75);
  makeLayer(Math.floor(count * 0.25), 2.0, 0xfff2d8, 0.9);
  return group;
}
