// 草原场景 · 后处理：Bloom + 分级 + 暗角 + 颗粒（配合 ACES 色调映射）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.06 },
    uContrast: { value: 1.05 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.014 },
    uCA: { value: 0.0016 },
    uSharpen: { value: 0.22 },
    uTime: { value: 0 },
    uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uCA;
    uniform float uSharpen;
    uniform float uTime;
    uniform vec2  uTexel;
    varying vec2 vUv;

    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p + 19.19); return fract(p.x * p.y); }

    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);

      // 轻微横向色差（只在画面边缘出现）
      vec2 off = d * r2 * uCA * 4.0;
      vec3 c;
      c.r = texture2D(tDiffuse, uv + off).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - off).b;

      // 锐化（unsharp），提升草叶清晰度
      vec3 blur = (
        texture2D(tDiffuse, uv + vec2(uTexel.x, 0.0)).rgb +
        texture2D(tDiffuse, uv - vec2(uTexel.x, 0.0)).rgb +
        texture2D(tDiffuse, uv + vec2(0.0, uTexel.y)).rgb +
        texture2D(tDiffuse, uv - vec2(0.0, uTexel.y)).rgb
      ) * 0.25;
      c += (c - blur) * uSharpen;

      // 曝光不在这里做：统一交给 renderer.toneMappingExposure，
      // 由链尾的 OutputPass 在 ACES 之前施加，避免两处重复乘。
      c = max(c, vec3(0.0));

      // 以中灰为轴的对比度（线性空间）
      c = (c - 0.18) * uContrast + 0.18;

      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(lum), c, uSaturation);

      // 暖高光 / 冷暗部（电影感的分离调色）
      c += vec3(0.010, 0.004, -0.008) * smoothstep(0.4, 1.6, lum);
      c += vec3(-0.004, 0.0, 0.010) * smoothstep(0.25, 0.0, lum);

      // 暗角
      c *= 1.0 - smoothstep(0.28, 0.86, length(d) * 1.15) * uVignette;

      // 胶片颗粒
      float g = hash(uv * 1024.0 + fract(uTime) * 137.0) - 0.5;
      c += g * uGrain * (1.0 - smoothstep(0.3, 1.0, lum));

      // NaN 保险：自定义着色器一旦写进 NaN，泛光的模糊会把 NaN 扩散到全屏、整幅变黑。
      // 这里做自检（NaN != NaN）把它压回 0，让问题退化成局部异常而不是全屏黑。
      c = mix(c, vec3(0.0), vec3(notEqual(c, c)));

      gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
    }
  `,
};

export function createPostFX(renderer, scene, camera, { width, height } = {}) {
  const w = width || renderer.domElement.width;
  const h = height || renderer.domElement.height;

  // 注意：这里必须 samples = 0。若给 composer 的 RT 开 MSAA，
  // 后续 UnrealBloomPass 采样 readBuffer.texture 时多重采样缓冲不会被解析，
  // 会读到全黑输入并把整帧压成黑色。抗锯齿改由链尾的 SMAA 负责。
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    samples: 0,
    colorSpace: THREE.LinearSRGBColorSpace,
  });

  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.34, 0.62, 0.92);
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  composer.addPass(new OutputPass());

  const aa = new SMAAPass(w, h);
  composer.addPass(aa);

  const params = {
    saturation: 1.06, contrast: 1.05,
    vignette: 0.34, grain: 0.014, chromatic: 0.0016, sharpen: 0.22,
    bloomStrength: 0.34, bloomRadius: 0.62, bloomThreshold: 0.92,
    aa: true,
  };

  const api = {
    composer, grade, bloom, aa, params,
    sync() {
      const u = grade.uniforms;
      u.uSaturation.value = params.saturation;
      u.uContrast.value = params.contrast;
      u.uVignette.value = params.vignette;
      u.uGrain.value = params.grain;
      u.uCA.value = params.chromatic;
      u.uSharpen.value = params.sharpen;
      bloom.strength = params.bloomStrength;
      bloom.radius = params.bloomRadius;
      bloom.threshold = params.bloomThreshold;
      aa.enabled = params.aa;
    },
    setSize(nw, nh) {
      composer.setSize(nw, nh);
      grade.uniforms.uTexel.value.set(1 / nw, 1 / nh);
    },
    render(t) {
      grade.uniforms.uTime.value = t;
      composer.render();
    },
  };
  api.sync();
  return api;
}
