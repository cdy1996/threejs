/* 全局场景导航 —— 左下角胶囊链接
   纯静态脚本，不经过打包，放在 public/ 下由 Vite 原样拷贝。
   各页面通过 <script src="/nav.js" defer></script> 引入即可。 */
(function () {
  'use strict';

  var SCENES = [
    { href: '/index.html',             label: '鱼缸' },
    { href: '/blackhole.html',         label: '黑洞' },
    { href: '/formula-blackhole.html', label: '公式黑洞' },
    { href: '/ocean.html',             label: '海面' },
    { href: '/seasun.html',            label: '日出' },
    { href: '/meadow.html',            label: '木屋' },
    { href: '/grassland.html',         label: '草原' },
    { href: '/aquarium.html',          label: '水缸' },
    { href: '/fire.html',              label: '消防' }
  ];

  var CSS = [
    '#scene-nav{',
      'position:fixed;left:16px;bottom:14px;z-index:9999;',
      'display:flex;flex-wrap:wrap;align-items:center;gap:1px;',
      'max-width:min(720px,calc(100vw - 32px));',
      'padding:5px 9px;border-radius:999px;',
      'background:rgba(10,20,26,.55);border:1px solid rgba(180,220,230,.22);',
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);',
      'font:11px/1.4 "PingFang SC","Microsoft YaHei",sans-serif;',
      'letter-spacing:.5px;pointer-events:auto;user-select:none;',
    '}',
    '#scene-nav a{',
      'color:rgba(226,244,248,.78);text-decoration:none;padding:2px 7px;border-radius:999px;',
      'white-space:nowrap;transition:background .15s,color .15s;',
    '}',
    '#scene-nav a:hover{background:rgba(140,220,235,.18);color:#eafcff;}',
    '#scene-nav a.sn-active{background:rgba(120,220,235,.3);color:#f2ffff;font-weight:600;}',
    '#scene-nav .sn-sep{color:rgba(180,220,230,.28);}'
  ].join('');

  function normalize(path) {
    if (!path || path === '/' || path.charAt(path.length - 1) === '/') return '/index.html';
    return path;
  }

  function build() {
    if (document.getElementById('scene-nav')) return;

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var here = normalize(location.pathname);
    var nav = document.createElement('nav');
    nav.id = 'scene-nav';
    nav.setAttribute('aria-label', '场景导航');

    SCENES.forEach(function (scene, i) {
      if (i) {
        var sep = document.createElement('span');
        sep.className = 'sn-sep';
        sep.textContent = '·';
        nav.appendChild(sep);
      }
      var a = document.createElement('a');
      a.href = scene.href;
      a.textContent = scene.label;
      if (scene.href === here) {
        a.className = 'sn-active';
        a.setAttribute('aria-current', 'page');
      }
      nav.appendChild(a);
    });

    document.body.appendChild(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
