/* Окно «Что нового» — один раз при первом входе после обновления.
 *
 * Как выпускать новую версию:
 *   1) в js/app.js поменять APP_VERSION;
 *   2) добавить в начало CHANGELOG запись { v, d, t, items: [{ i, h, p }, ...] }
 *      i — иконка: flame | home | edit | chat | bolt | star | shield | chart
 *   Окно само покажется каждому человеку один раз (запоминается в localStorage).
 */
(function () {
  'use strict';

  var SEEN_KEY = 'ios_whatsnew_seen';
  var shown = false;

  var ICONS = {
    flame: ['#ff9f0a', 'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z'],
    home:  ['#0a84ff', 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'],
    edit:  ['#30d158', 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'],
    chat:  ['#64d2ff', 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z'],
    bolt:  ['#ffd60a', 'M7 2v11h3v9l7-12h-4l4-8z'],
    star:  ['#bf5af2', 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'],
    shield:['#30d158', 'M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z'],
    chart: ['#0a84ff', 'M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z']
  };

  var CSS = '' +
  '.wn{position:fixed;inset:0;z-index:21000;display:flex;align-items:center;justify-content:center;padding:18px;' +
    'padding-top:calc(18px + env(safe-area-inset-top,0px));padding-bottom:calc(18px + env(safe-area-inset-bottom,0px));' +
    'background:rgba(0,0,0,.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:0;pointer-events:none;transition:opacity .35s}' +
  '.wn.on{opacity:1;pointer-events:auto}' +
  '.wn-card{position:relative;width:100%;max-width:400px;max-height:100%;display:flex;flex-direction:column;overflow:hidden;border-radius:32px;' +
    'background:linear-gradient(180deg,rgba(44,44,56,.96),rgba(22,22,28,.98));border:1px solid rgba(255,255,255,.14);' +
    'box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 .5px rgba(255,255,255,.06) inset;color:#fff;' +
    'transform:translateY(34px) scale(.95);opacity:0;transition:transform .6s cubic-bezier(.2,1.15,.3,1),opacity .4s}' +
  '.wn.on .wn-card{transform:none;opacity:1}' +
  '.wn-aura{position:absolute;left:50%;top:-90px;width:380px;height:300px;margin-left:-190px;pointer-events:none;' +
    'background:radial-gradient(closest-side,rgba(255,159,10,.5),rgba(255,94,0,.18) 55%,transparent);filter:blur(8px);animation:wnAura 4s ease-in-out infinite alternate}' +
  '@keyframes wnAura{from{opacity:.75;transform:scale(.94)}to{opacity:1;transform:scale(1.06)}}' +
  '.wn-head{position:relative;text-align:center;padding:30px 24px 8px}' +
  '.wn-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 12px;border-radius:99px;font-size:12px;font-weight:700;letter-spacing:.3px;' +
    'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);color:#ffd9a0}' +
  '.wn-pill i{width:6px;height:6px;border-radius:50%;background:#ff9f0a;box-shadow:0 0 8px #ff9f0a;animation:wnDot 1.6s ease-in-out infinite}' +
  '@keyframes wnDot{50%{opacity:.35}}' +
  '.wn-title{font-size:32px;font-weight:800;letter-spacing:-.8px;line-height:1.1;margin:14px 0 4px;' +
    'background:linear-gradient(100deg,#fff,#ffd49a 60%,#ff9f0a);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}' +
  '.wn-sub{font-size:13.5px;color:rgba(255,255,255,.58)}' +
  '.wn-list{position:relative;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 20px 6px;display:flex;flex-direction:column;gap:6px}' +
  '.wn-it{display:flex;gap:14px;align-items:flex-start;padding:10px 6px;opacity:0;transform:translateY(14px)}' +
  '.wn.on .wn-it{animation:wnIn .55s cubic-bezier(.2,.9,.3,1) forwards}' +
  '@keyframes wnIn{to{opacity:1;transform:none}}' +
  '.wn-ic{flex:0 0 42px;width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;' +
    'background:color-mix(in srgb,var(--c) 20%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 28%,transparent)}' +
  '.wn-ic svg{width:23px;height:23px;fill:var(--c)}' +
  '.wn-tx{min-width:0}.wn-h{font-size:16px;font-weight:700;line-height:1.25}' +
  '.wn-p{font-size:13.5px;line-height:1.38;color:rgba(255,255,255,.62);margin-top:3px}' +
  '.wn-foot{position:relative;padding:12px 20px 20px;display:flex;flex-direction:column;gap:4px}' +
  '.wn-btn{height:52px;border:0;border-radius:18px;font-size:17px;font-weight:700;color:#1b0f00;cursor:pointer;' +
    'background:linear-gradient(135deg,#ffb340,#ff9f0a 55%,#ff7a00);box-shadow:0 8px 24px rgba(255,140,0,.35);-webkit-tap-highlight-color:transparent;transition:transform .15s}' +
  '.wn-btn:active{transform:scale(.97)}' +
  '.wn-more{height:40px;border:0;background:none;color:rgba(255,255,255,.5);font-size:14px;font-weight:600;cursor:pointer}' +
  '@media (prefers-reduced-motion:reduce){.wn-aura,.wn-pill i{animation:none}.wn-card,.wn{transition:opacity .2s}.wn-it{opacity:1;transform:none;animation:none!important}}';

  var el = null;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function entry() {
    try { return (typeof CHANGELOG !== 'undefined' && CHANGELOG[0]) || null; } catch (e) { return null; }
  }
  function curVersion() {
    try { return typeof APP_VERSION !== 'undefined' ? APP_VERSION : null; } catch (e) { return null; }
  }

  function build(e) {
    var items = (e.items && e.items.length) ? e.items : [{ i: 'star', h: 'Что изменилось', p: e.t }];
    var rows = items.map(function (it, n) {
      var ic = ICONS[it.i] || ICONS.star;
      return '<div class="wn-it" style="animation-delay:' + (0.25 + n * 0.09).toFixed(2) + 's">' +
        '<div class="wn-ic" style="--c:' + ic[0] + '"><svg viewBox="0 0 24 24"><path d="' + ic[1] + '"/></svg></div>' +
        '<div class="wn-tx"><div class="wn-h">' + esc(it.h) + '</div>' + (it.p ? '<div class="wn-p">' + esc(it.p) + '</div>' : '') + '</div></div>';
    }).join('');

    return '<div class="wn-card" role="dialog" aria-modal="true" aria-label="Что нового">' +
      '<div class="wn-aura"></div>' +
      '<div class="wn-head"><span class="wn-pill"><i></i>Обновление · v' + esc(e.v) + '</span>' +
        '<div class="wn-title">Что нового</div><div class="wn-sub">' + esc(e.d || '') + '</div></div>' +
      '<div class="wn-list">' + rows + '</div>' +
      '<div class="wn-foot"><button class="wn-btn" id="wnOk">Поехали</button>' +
        '<button class="wn-more" id="wnMore">Все изменения</button></div>' +
      '</div>';
  }

  function close(openList) {
    if (!el) return;
    el.classList.remove('on');
    var node = el; el = null;
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 450);
    if (openList) { try { openChangelog(); } catch (e) {} }
  }

  function show() {
    var e = entry();
    if (!e || el) return;
    if (!document.getElementById('wnCss')) {
      var st = document.createElement('style'); st.id = 'wnCss'; st.textContent = CSS; document.head.appendChild(st);
    }
    el = document.createElement('div');
    el.className = 'wn';
    el.innerHTML = build(e);
    document.body.appendChild(el);
    el.addEventListener('click', function (ev) { if (ev.target === el) close(false); });
    el.querySelector('#wnOk').addEventListener('click', function () { close(false); });
    el.querySelector('#wnMore').addEventListener('click', function () { close(true); });
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (el) el.classList.add('on'); }); });
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (x) {}
  }

  /* человек уже внутри приложения, а не на входе/заглушке, и ничего другого не открыто */
  function inApp() {
    var active = document.querySelector('.screen.active');
    if (!active) return false;
    if (active.id === 'screenGate' || active.id === 'screenMaint') return false;
    if (document.querySelector('.modal-overlay.active, .confirm-overlay.active, .fo.on')) return false;
    return !document.hidden;
  }

  function needed() {
    var v = curVersion(), e = entry();
    if (!v || !e || e.v !== v) return false;
    try { return localStorage.getItem(SEEN_KEY) !== v; } catch (x) { return false; }
  }

  function tick() {
    if (shown || !needed()) { if (shown || !needed()) clearInterval(timer); return; }
    if (!inApp()) return;
    shown = true;
    clearInterval(timer);
    try { localStorage.setItem(SEEN_KEY, curVersion()); } catch (x) {}   // помечаем сразу: показываем строго один раз
    setTimeout(show, 700);
  }

  var timer = setInterval(tick, 900);
  setTimeout(tick, 1200);

  window.showWhatsNew = show;                                              // для проверки: showWhatsNew()
})();
