import * as THREE from 'three';
import { TANK, COLORS } from './utils.js';

/**
 * 纯水模型（无玻璃缸体）：
 * - 水体 Volume：六棱柱侧面，深度雾 shader
 * - 水面：细分圆盘，多重正弦波顶点起伏 + 波纹高光
 * 半透明物体统一后渲染：水体 renderOrder=10，水面 renderOrder=12
 */

const waterVertex = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const waterFragment = /* glsl */ `
  uniform vec3 uShallowColor;
  uniform vec3 uDeepColor;
  uniform float uWaterTopY;
  uniform float uWaterBottomY;
  uniform float uUnderwater;   // 0 空中视角, 1 相机在水中
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    float depth = clamp((uWaterTopY - vWorldPos.y) / (uWaterTopY - uWaterBottomY), 0.0, 1.0);
    vec3 col = mix(uShallowColor, uDeepColor, pow(depth, 1.35));

    // 微弱流动光带，模拟焦散
    float band = sin(vWorldPos.y * 6.0 - uTime * 1.4 + vWorldPos.x * 1.5) * 0.5 + 0.5;
    col += vec3(0.05, 0.09, 0.08) * band * (1.0 - depth);

    float facing = max(dot(vWorldNormal, vec3(0.0, 0.0, 1.0)), 0.25);
    // 空中看：较通透；进入水中：变成浓雾罩
    float alpha = mix(0.16 + depth * 0.28, 0.55 + depth * 0.25, uUnderwater);
    alpha *= mix(1.0, facing, 0.5);
    // 背面（相机在水里时看到的内壁）加深水色
    if (!gl_FrontFacing) {
      col = mix(col, uDeepColor, 0.7);
      alpha = max(alpha, mix(0.18, 0.62, uUnderwater));
    }
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
  }
`;

const surfaceVertex = /* glsl */ `
  uniform float uTime;
  uniform float uWaveAmp;
  varying vec3 vWorldPos;
  varying float vWave;

  // 波面高度场：多方向叠加的正弦波
  float waveH(vec2 p, float t) {
    float h = 0.0;
    h += sin(p.x * 0.9 + t * 1.3) * 0.5;
    h += sin(p.y * 1.2 - t * 1.0) * 0.4;
    h += sin((p.x + p.y) * 0.7 + t * 1.7) * 0.35;
    h += sin(length(p) * 1.6 - t * 2.0) * 0.3;
    return h;
  }

  void main() {
    vec3 p = position;
    vec4 world0 = modelMatrix * vec4(p, 1.0);
    float h = waveH(world0.xz, uTime);
    world0.y += h * uWaveAmp;
    vWave = h;
    vWorldPos = world0.xyz;
    gl_Position = projectionMatrix * viewMatrix * world0;
  }
`;

const surfaceFragment = /* glsl */ `
  uniform vec3 uShallowColor;
  uniform float uTime;
  varying vec3 vWorldPos;
  varying float vWave;
  void main() {
    // 波峰亮、波谷深的波纹着色
    float crest = smoothstep(0.35, 1.2, vWave);
    float trough = smoothstep(-0.35, -1.2, vWave);
    vec3 col = uShallowColor;
    col += vec3(0.14, 0.17, 0.16) * crest;   // 波峰提亮
    col -= vec3(0.05, 0.08, 0.08) * trough;  // 波谷加深
    // 细密波纹
    float ripple = sin(vWorldPos.x * 2.4 + uTime * 1.8) * sin(vWorldPos.z * 2.1 - uTime * 1.3);
    col += vec3(0.06, 0.09, 0.08) * ripple;
    gl_FragColor = vec4(col, 0.62);
  }
`;

export function createAquarium() {
  const group = new THREE.Group();

  // ---- 木质底座 ----
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(TANK.baseRadius, TANK.baseRadius + 0.3, TANK.baseHeight, 6),
    new THREE.MeshToonMaterial({ color: 0x8a5a3b })
  );
  base.position.y = TANK.baseHeight / 2;
  group.add(base);

  // ---- 水体 Volume（六棱柱侧面） ----
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uShallowColor: { value: new THREE.Color(COLORS.waterShallow) },
      uDeepColor: { value: new THREE.Color(COLORS.waterDeep) },
      uWaterTopY: { value: TANK.waterTopY },
      uWaterBottomY: { value: TANK.waterBottomY },
      uUnderwater: { value: 0 },
      uTime: { value: 0 }
    },
    vertexShader: waterVertex,
    fragmentShader: waterFragment
  });
  const waterH = TANK.waterTopY - TANK.waterBottomY;
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(TANK.waterRadius, TANK.waterRadius, waterH, 6, 1, true),
    waterMat
  );
  water.position.y = TANK.waterBottomY + waterH / 2;
  water.renderOrder = 10;
  group.add(water);

  // ---- 水面（细分圆盘，顶点波浪起伏） ----
  // 半径取六棱柱内切半径，恰好贴住水体侧壁
  const surfaceRadius = TANK.waterRadius * 0.866;
  const surfaceGeo = new THREE.CircleGeometry(surfaceRadius, 40);
  const surfaceMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uShallowColor: { value: new THREE.Color(COLORS.waterShallow) },
      uTime: { value: 0 },
      uWaveAmp: { value: 0.22 }
    },
    vertexShader: surfaceVertex,
    fragmentShader: surfaceFragment
  });
  const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = TANK.waterTopY;
  surface.renderOrder = 12;
  group.add(surface);

  return {
    group,
    waterMat,
    surfaceMat,
    update(t) {
      waterMat.uniforms.uTime.value = t;
      surfaceMat.uniforms.uTime.value = t;
    }
  };
}
