import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// 屏幕空间引力透镜：把黑洞周围像素向中心弯折 + 轻微切向漩涡，
// 视界内压黑、视界边缘补一圈暖色亮边（与光子环衔接）
export function createLensPass() {
  const shader = {
    uniforms: {
      tDiffuse: { value: null },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uHorizonR: { value: 0.08 },
      uStrength: { value: 0.6 },
      uRange: { value: 0.45 },
      uSwirl: { value: 0.12 },
      uAspect: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 uCenter;
      uniform float uHorizonR, uStrength, uRange, uSwirl, uAspect;
      varying vec2 vUv;

      void main() {
        vec2 d = vUv - uCenter;
        d.x *= uAspect;
        float r = length(d);
        vec2 dir = r > 1e-4 ? d / r : vec2(0.0);

        float fall = 1.0 - smoothstep(0.0, uRange, r);
        float pull = uStrength * 0.05 * fall * fall / (r + 0.06);
        float sw = uSwirl * 0.08 * fall * fall;

        vec2 tangent = vec2(-dir.y, dir.x);
        vec2 offset = -dir * pull + tangent * sw;
        offset.x /= uAspect;

        vec3 col = texture2D(tDiffuse, vUv + offset).rgb;

        // 视界边缘暖色亮边
        float edge = exp(-pow((r - uHorizonR * 1.18) / (uHorizonR * 0.25 + 1e-4), 2.0));
        col += vec3(1.0, 0.85, 0.6) * edge * 0.12 * (0.5 + uStrength);

        // 视界内压黑
        float inside = 1.0 - smoothstep(uHorizonR * 0.92, uHorizonR * 1.0, r);
        col *= 1.0 - inside;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  };
  const pass = new ShaderPass(shader);
  pass.uniforms = shader.uniforms; // 直接暴露 uniforms 便于外部更新
  return pass;
}

// 每帧调用：把黑洞世界坐标与视界半径换算到屏幕空间
const _center = new THREE.Vector3();
const _edge = new THREE.Vector3();
const _right = new THREE.Vector3();

export function updateLensUniforms(pass, camera, horizonMesh, horizonRadius, aspect) {
  horizonMesh.getWorldPosition(_center);
  const p1 = _center.clone().project(camera);
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _edge.copy(_center).addScaledVector(_right, horizonRadius).project(camera);
  const rScreen = Math.hypot(_edge.x - p1.x, _edge.y - p1.y) * 0.5;

  const u = pass.uniforms;
  u.uCenter.value.set(p1.x * 0.5 + 0.5, p1.y * 0.5 + 0.5);
  u.uHorizonR.value = Math.max(rScreen, 1e-3);
  u.uAspect.value = aspect;
}
