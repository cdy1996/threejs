import * as THREE from 'three';
import { TANK } from './utils.js';
import { SEAWEED_CLUSTERS } from './seabed.js';

/**
 * 气泡：从海草/绿植丛中冒出，上升过程中逐渐变大，到水面附近轻微加速并淡出
 * THREE.Points + 自定义 shader，数量通过 drawRange 控制（上限 400）
 */

export const MAX_BUBBLES = 400;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uScale;      // 像素换算系数（随窗口尺寸更新）
  uniform float uBottomY;
  uniform float uTopY;
  attribute float aSeed;     // 0~1 随机相位
  attribute float aSpeed;    // 上升速度（单位/秒）
  attribute float aSize;     // 基础尺寸（世界单位）
  varying float vP;          // 上升进度 0~1

  void main() {
    float range = uTopY - uBottomY;
    float y = uBottomY + mod(aSeed * 97.0 + uTime * aSpeed, range);
    float p = clamp((y - uBottomY) / range, 0.0, 1.0);
    vP = p;

    // 左右摇摆（越往上摆幅略大）
    float sway = sin(uTime * (1.2 + aSeed * 1.6) + aSeed * 40.0) * (0.06 + p * 0.16);
    float sway2 = cos(uTime * (0.8 + aSeed) + aSeed * 23.0) * (0.05 + p * 0.12);

    vec3 pos = position;
    pos.y = y;
    pos.x += sway;
    pos.z += sway2;

    // 越到上面气泡越大
    float worldSize = aSize * (0.4 + p * 1.6);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = worldSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vP;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    // 环形气泡：边缘亮、内部更透明
    float body = smoothstep(0.5, 0.42, d);
    float rim = 0.3 + 0.8 * smoothstep(0.30, 0.47, d);
    // 左上高光点
    float hi = smoothstep(0.16, 0.02, length(uv - vec2(-0.14, 0.14)));

    vec3 col = vec3(0.82, 0.94, 0.98) + vec3(1.0) * hi * 0.9;
    float alpha = body * rim * 0.65;

    // 底部刚冒出淡入，接近水面淡出（破裂）
    alpha *= smoothstep(0.0, 0.06, vP) * (1.0 - smoothstep(0.9, 1.0, vP));

    gl_FragColor = vec4(col, alpha);
  }
`;

export function createBubbles() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_BUBBLES * 3);
  const seeds = new Float32Array(MAX_BUBBLES);
  const speeds = new Float32Array(MAX_BUBBLES);
  const sizes = new Float32Array(MAX_BUBBLES);

  for (let i = 0; i < MAX_BUBBLES; i++) {
    // 出生点：随机挑一簇海草附近
    const [cx, cz] = SEAWEED_CLUSTERS[i % SEAWEED_CLUSTERS.length];
    positions[i * 3] = cx + (Math.random() - 0.5) * 0.9;
    positions[i * 3 + 1] = 2.0;
    positions[i * 3 + 2] = cz + (Math.random() - 0.5) * 0.9;
    seeds[i] = Math.random();
    speeds[i] = 0.55 + Math.random() * 0.75;
    sizes[i] = 0.045 + Math.random() * 0.075;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setDrawRange(0, 150); // 默认数量

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 800 },
      uBottomY: { value: 2.0 },
      uTopY: { value: TANK.waterTopY - 0.1 }
    },
    vertexShader,
    fragmentShader
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = 6; // 鱼群之后、水体之前
  points.frustumCulled = false;

  return {
    points,
    setCount(n) {
      geometry.setDrawRange(0, Math.min(n, MAX_BUBBLES));
    },
    update(t) {
      material.uniforms.uTime.value = t;
      // 透视投影像素换算：height / 2 / tan(fov/2)
      const fov = 55;
      material.uniforms.uScale.value =
        (renderer_height() * 0.5) / Math.tan((fov * 0.5 * Math.PI) / 180);
    }
  };
}

// 避免循环依赖，直接读画布高度
function renderer_height() {
  const c = document.querySelector('#app canvas');
  return c ? c.clientHeight : window.innerHeight;
}
