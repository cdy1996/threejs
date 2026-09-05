import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { TANK, COLORS, rand, randInt, toonMaterial } from './utils.js';

/**
 * 海底地貌：沙地、礁石、海草（顶点摇摆）、红珊瑚（程序化分支）、海藻球
 * 全部由代码几何体拼装，零外部模型
 */

// ---------- 沙地 ----------
function buildSand() {
  const geo = new THREE.CircleGeometry(TANK.glassRadius * 0.985, 48, 0, Math.PI * 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const h =
      Math.sin(x * 1.3) * Math.cos(y * 1.1) * 0.18 +
      Math.sin(x * 3.1 + y * 2.4) * 0.07;
    pos.setZ(i, h);
  }
  geo.computeVertexNormals();
  const sand = new THREE.Mesh(geo, toonMaterial(COLORS.sand));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = 1.75;
  return sand;
}

// ---------- 礁石 ----------
function buildRock(scale = 1) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const n = 0.72 + Math.random() * 0.5;
    pos.setXYZ(i, pos.getX(i) * n, pos.getY(i) * n * 0.75, pos.getZ(i) * n);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, toonMaterial(COLORS.rock));
}

function buildRocks() {
  const group = new THREE.Group();
  const spots = [
    [-2.6, -1.6, 1.5], [-1.7, -2.4, 1.0], [-3.2, -0.4, 0.8],
    [2.8, 1.9, 1.2], [2.2, 2.7, 0.7], [0.4, -3.2, 0.9]
  ];
  for (const [x, z, s] of spots) {
    const rock = buildRock();
    rock.scale.setScalar(s);
    rock.position.set(x, 1.9 + s * 0.32, z);
    rock.rotation.y = Math.random() * Math.PI;
    group.add(rock);
  }
  return group;
}

// ---------- 海草（合并几何 + 顶点摇摆 shader） ----------
function buildSeaweed() {
  const geos = [];
  const phases = [];
  const bend = [];
  const clusters = [
    [-3.6, 1.6], [-2.9, 2.4], [3.4, -1.2], [3.9, -0.2],
    [1.4, 3.6], [0.6, 3.9], [-0.8, -3.6], [1.9, -3.4], [-4.0, -0.6]
  ];
  for (const [cx, cz] of clusters) {
    const blades = randInt(9, 14);
    for (let b = 0; b < blades; b++) {
      const h = rand(1.2, 3.0);
      const geo = new THREE.PlaneGeometry(rand(0.14, 0.24), h, 1, 6);
      geo.translate(rand(-0.35, 0.35), h / 2, rand(-0.35, 0.35));
      const count = geo.attributes.position.count;
      const phaseArr = new Float32Array(count).fill(Math.random() * Math.PI * 2);
      const bendArr = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        bendArr[i] = Math.max(0, geo.attributes.position.getY(i) / h);
      }
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phaseArr, 1));
      geo.setAttribute('aBend', new THREE.BufferAttribute(bendArr, 1));
      // 平移到簇位置
      geo.translate(cx, 1.85, cz);
      geos.push(geo);
    }
  }
  const merged = BufferGeometryUtils.mergeGeometries(geos);

  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aPhase;
      attribute float aBend;
      varying float vShade;
      void main() {
        vec3 p = position;
        float sway = sin(uTime * 1.4 + aPhase + p.y * 0.8) + sin(uTime * 0.7 + aPhase * 2.0) * 0.5;
        p.x += sway * 0.22 * aBend * aBend;
        p.z += cos(uTime * 1.1 + aPhase) * 0.12 * aBend * aBend;
        vShade = aBend;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vShade;
      void main() {
        vec3 low = vec3(0.10, 0.38, 0.22);
        vec3 high = vec3(0.22, 0.68, 0.32);
        vec3 col = mix(low, high, vShade);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  const mesh = new THREE.Mesh(merged, mat);
  return { mesh, mat };
}

// ---------- 红珊瑚（程序化分支） ----------
function buildCoral() {
  const geos = [];
  function branch(origin, dir, len, radius, depth) {
    const end = origin.clone().addScaledVector(dir, len);
    const geo = new THREE.CylinderGeometry(radius * 0.62, radius, len, 5);
    geo.translate(0, len / 2, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const mat4 = new THREE.Matrix4().compose(origin, quat, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(mat4);
    geos.push(geo);
    if (depth <= 0) {
      // 枝端小圆头
      const tip = new THREE.SphereGeometry(radius * 0.8, 6, 5);
      tip.translate(end.x, end.y, end.z);
      geos.push(tip);
      return;
    }
    const kids = randInt(2, 3);
    for (let i = 0; i < kids; i++) {
      const nd = dir
        .clone()
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), rand(0.3, 0.7) * (Math.random() > 0.5 ? 1 : -1))
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), rand(0.3, 0.7) * (Math.random() > 0.5 ? 1 : -1))
        .normalize();
      branch(end, nd, len * rand(0.6, 0.8), radius * 0.65, depth - 1);
    }
  }
  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.9, 0.16, 3);

  const merged = BufferGeometryUtils.mergeGeometries(geos);
  const mat = toonMaterial(COLORS.coral);
  return new THREE.Mesh(merged, mat);
}

function buildCorals() {
  const group = new THREE.Group();
  const spots = [
    [2.0, 0.2, 1.0], [3.2, 1.0, 0.7], [-2.2, 3.0, 0.85], [-1.2, -2.8, 0.75], [0.2, 2.2, 0.6]
  ];
  for (const [x, z, s] of spots) {
    const coral = buildCoral();
    coral.scale.setScalar(s);
    coral.position.set(x, 1.85, z);
    coral.rotation.y = Math.random() * Math.PI * 2;
    group.add(coral);
  }
  return group;
}

// ---------- 海藻球 ----------
function buildAlgaeBalls() {
  const group = new THREE.Group();
  const spots = [
    [-1.4, -1.0, 0.85], [1.6, 0.6, 0.65], [-2.8, 1.8, 0.5]
  ];
  for (const [x, z, s] of spots) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const n = 1 + (Math.random() - 0.5) * 0.12;
      pos.setXYZ(i, pos.getX(i) * n, pos.getY(i) * n, pos.getZ(i) * n);
    }
    geo.computeVertexNormals();
    const ball = new THREE.Mesh(geo, toonMaterial(COLORS.algae));
    ball.scale.setScalar(s);
    ball.position.set(x, 1.85 + s * 0.75, z);
    group.add(ball);
  }
  return group;
}

export function createSeabed() {
  const group = new THREE.Group();
  group.add(buildSand());

  const rocks = buildRocks();
  group.add(rocks);

  const seaweed = buildSeaweed();
  group.add(seaweed.mesh);

  const corals = buildCorals();
  group.add(corals);

  const algae = buildAlgaeBalls();
  group.add(algae);

  return {
    group,
    update(t) {
      seaweed.mat.uniforms.uTime.value = t;
    }
  };
}
