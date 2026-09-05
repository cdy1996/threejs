import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * 后处理：轻微色彩调色 + 暗角，营造卡通清新通透感
 */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.12 },
    uVignette: { value: 0.22 },
    uWarmth: { value: 0.015 }
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
    uniform float uSaturation;
    uniform float uVignette;
    uniform float uWarmth;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // 饱和度
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(lum), c.rgb, uSaturation);
      // 青色暖调微偏移
      c.rgb += vec3(uWarmth, uWarmth * 0.4, -uWarmth * 0.3);
      // 暗角
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - smoothstep(0.55, 0.95, d) * uVignette;
      gl_FragColor = c;
    }
  `
};

export function createPostFX(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());

  return {
    composer,
    setSize(w, h) {
      composer.setSize(w, h);
    },
    render(t) {
      composer.render();
    }
  };
}
