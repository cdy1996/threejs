/* storage.js — 本地存档垫片
 * 复刻自 B 站玩具「屿生」的 toy-adapter：原版通过 IslandStorage 给 localStorage
 * 加命名空间前缀；本工程去掉平台适配器，仅保留等价的最小实现。
 * 必须在 app.js 之前加载。
 */
(function (root) {
  'use strict';
  var prefix = 'island-atelier:';
  var readError = false;
  root.IslandStorage = {
    getItem: function (key) {
      try {
        return root.localStorage.getItem(prefix + key);
      } catch (error) {
        readError = true;
        return null;
      }
    },
    setItem: function (key, value) {
      try {
        root.localStorage.setItem(prefix + key, value);
      } catch (error) {
        readError = true;
      }
    },
    hasReadError: function () { return readError; }
  };
})(typeof window !== 'undefined' ? window : this);
