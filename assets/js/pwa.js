/* ODH · 安卓安装支持
   - 注册 Service Worker，让页面可离线、可安装
   - 首页监听 beforeinstallprompt，给出「装到桌面」提示条 */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });

  var HIDE_KEY = 'odh.install.hide';
  var deferred = null;
  var isHome = /(?:^|\/)index\.html$/.test(location.pathname) || /\/$/.test(location.pathname);

  function recentlyHidden() {
    var t = Number(localStorage.getItem(HIDE_KEY) || 0);
    return t > 0 && Date.now() - t < 7 * 24 * 3600 * 1000;
  }

  function hideBar(hideDays) {
    var bar = document.getElementById('install-bar');
    if (bar) {
      bar.classList.remove('on');
      setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 220);
    }
    if (hideDays) {
      try { localStorage.setItem(HIDE_KEY, String(Date.now())); } catch (e) {}
    }
  }

  function showBar() {
    if (!isHome || document.getElementById('install-bar')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (recentlyHidden()) return;

    var bar = document.createElement('div');
    bar.id = 'install-bar';
    bar.className = 'install-bar';
    bar.innerHTML =
      '<img src="assets/icons/icon-192.png" alt="" width="38" height="38">' +
      '<div class="ib-txt"><b>装到桌面</b><span>像 App 一样全屏打开，不用每次输网址</span></div>' +
      '<button class="ib-go" type="button">安装</button>' +
      '<button class="ib-no" type="button" aria-label="关闭">×</button>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('on'); });

    var go = bar.querySelector('.ib-go');
    var no = bar.querySelector('.ib-no');
    go.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () {
        deferred = null;
        hideBar(true);
      });
    });
    no.addEventListener('click', function () { hideBar(true); });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    showBar();
  });

  window.addEventListener('appinstalled', function () { hideBar(true); });
})();
