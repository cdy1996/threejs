import * as THREE from 'three';
import { TANK, COLORS } from './utils.js';

/**
 * 鱼缸容器：木质底座 + 六边形玻璃外壳（菲涅尔 shader）+ 水体 Volume（深度雾 shader）
 * 半透明物体统一后渲染：水体 renderOrder=10，玻璃 renderOrder=20
 */

const glassVertex = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const glassFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFresnelPower;
  uniform float uOpacity;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    float fresnel = pow(1.0 - max(dot(vWorldNormal, vViewDir), 0.0), uFresnelPower);
    vec3 col = uColor + fresnel * 0.45;
    float alpha = uOpacity + fresnel * 0.5;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
  }
`;

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
  varying vec3 vWorldPos;
  void main() {
    vec3 p = position;
    vec4 world0 = modelMatrix * vec4(p, 1.0);
    // 水面微微起伏
    world0.y += sin(uTime * 1.6 + world0.x * 1.2 + world0.z * 0.9) * 0.05;
    vWorldPos = world0.xyz;
    gl_Position = projectionMatrix * viewMatrix * world0;
  }
`;

const surfaceFragment = /* glsl */ `
  uniform vec3 uShallowColor;
  uniform float uTime;
  varying vec3 vWorldPos;
  void main() {
    float ripple = sin(vWorldPos.x * 2.4 + uTime * 1.8) * sin(vWorldPos.z * 2.1 - uTime * 1.3);
    vec3 col = uShallowColor + vec3(0.10, 0.13, 0.12) * ripple;
    gl_FragColor = vec4(col, 0.55);
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

  // 底座上沿装饰环
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(TANK.glassRadius + 0.12, 0.16, 10, 6),
    new THREE.MeshToonMaterial({ color: 0x6f4429 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = TANK.glassBottomY + 0.05;
  group.add(rim);

  // ---- 玻璃外壳（六棱柱侧面 + 顶部开口沿口） ----
  const glassMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(COLORS.glass) },
      uFresnelPower: { value: 2.2 },
      uOpacity: { value: 0.08 }
    },
    vertexShader: glassVertex,
    fragmentShader: glassFragment
  });
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(TANK.glassRadius, TANK.glassRadius, TANK.glassHeight, 6, 1, true),
    glassMat
  );
  glass.position.y = TANK.glassBottomY + TANK.glassHeight / 2;
  glass.renderOrder = 20;
  group.add(glass);

  // 顶部玻璃沿口
  const topRim = new THREE.Mesh(
    new THREE.TorusGeometry(TANK.glassRadius + 0.05, 0.1, 10, 6),
    new THREE.MeshToonMaterial({ color: 0x7fb8b4 })
  );
  topRim.rotation.x = Math.PI / 2;
  topRim.position.y = TANK.glassBottomY + TANK.glassHeight;
  group.add(topRim);

  // ---- 水体 Volume ----
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

  // ---- 水面盖 ----
  const surfaceMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uShallowColor: { value: new THREE.Color(COLORS.waterShallow) },
      uTime: { value: 0 }
    },
    vertexShader: surfaceVertex,
    fragmentShader: surfaceFragment
  });
  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(TANK.waterRadius, 6),
    surfaceMat
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = TANK.waterTopY;
  surface.renderOrder = 12;
  group.add(surface);

  return {
    group,
    waterMat,
    surfaceMat,
    glassMat,
    update(t) {
      waterMat.uniforms.uTime.value = t;
      surfaceMat.uniforms.uTime.value = t;
    }
  };
}
