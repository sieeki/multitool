/* Огонёк серии смен — растёт от числа внесённых смен подряд, тухнет, если забыл внести.
 * Подключается ПОСЛЕ app.js: переопределяет renderStreak / showStreakToast и вешает
 * обновление на saveData / saveArchive.
 *
 * Правила:
 *  - серия = смены, между которыми не больше 3 дней (то есть до 2 выходных подряд не ломают её)
 *  - с последней смены прошло: 0 дней — горит, 1 — тёплый, 2 — слабеет, 3 — тлеет, 4+ — потух, серия 0
 *  - уровни: Искра 1+, Огонь 3+, Жар 7+, Пекло 14+, Инферно 30+
 */
(function () {
  'use strict';

  var MAX_GAP = 3;
  var TIERS = [
    { min: 1,  name: 'Искра' },
    { min: 3,  name: 'Огонь' },
    { min: 7,  name: 'Жар' },
    { min: 14, name: 'Пекло' },
    { min: 30, name: 'Инферно' }
  ];
  var BEST_KEY = 'ios_flame_best';

  /* ---------- расчёт ---------- */
  function dayNum(iso) {
    var p = iso.split('-');
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  function plural(n, f) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return f[2];
    if (b > 1 && b < 5) return f[1];
    if (b === 1) return f[0];
    return f[2];
  }
  function tierOf(count) {
    var t = 0;
    for (var i = 0; i < TIERS.length; i++) if (count >= TIERS[i].min) t = i + 1;
    return t;
  }
  function addDays(iso, n) {
    var p = iso.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10);
  }
  function readGrant() {
    try {
      var g = JSON.parse(localStorage.getItem('ios_flame_grant') || 'null');
      return g && g.count > 0 && g.date ? g : null;
    } catch (e) { return null; }
  }

  /* чистый расчёт: дни смен + (необязательно) выданный огонёк */
  function compute(days, grant, today, bestStored) {
    var set = {};
    days.forEach(function (d) { if (d && d <= today) set[d] = 1; });
    if (grant && grant.count > 0 && grant.date) {
      var n = Math.min(+grant.count || 0, 365);
      for (var k = 0; k < n; k++) { var gd = addDays(grant.date, -k); if (gd <= today) set[gd] = 1; }
    }
    days = Object.keys(set).sort();

    var best = 0, run = 0;
    for (var i = 0; i < days.length; i++) {
      run = (i && dayNum(days[i]) - dayNum(days[i - 1]) <= MAX_GAP) ? run + 1 : 1;
      if (run > best) best = run;
    }
    best = Math.max(best, bestStored || 0);

    var res = { count: 0, state: 'dead', since: null, tier: 0, best: best };
    if (!days.length) return res;

    var since = dayNum(today) - dayNum(days[days.length - 1]);
    res.since = since;
    res.state = since === 0 ? 'hot' : since === 1 ? 'warm' : since === 2 ? 'weak' : since === 3 ? 'ember' : 'dead';
    if (res.state !== 'dead') {
      var c = 1;
      for (var j = days.length - 1; j > 0; j--) {
        if (dayNum(days[j]) - dayNum(days[j - 1]) <= MAX_GAP) c++; else break;
      }
      res.count = c;
      res.tier = tierOf(c);
      if (c > res.best) res.best = c;
    }
    return res;
  }

  function info() {
    var days = [];
    try { days = allShiftIsoDays(); } catch (e) {}
    var stored = 0;
    try { stored = +localStorage.getItem(BEST_KEY) || 0; } catch (e) {}
    var res = compute(days, readGrant(), todayIsoLocal(), stored);
    try { localStorage.setItem(BEST_KEY, String(res.best)); } catch (e) {}
    return res;
  }

  /* огонёк другого аккаунта по его облачным данным (для root) */
  function flameFromPayload(payload) {
    payload = payload || {};
    function arr(v) {
      if (!v) return null;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } }
      return v;
    }
    var days = [];
    var d = arr(payload.ios_multitool_data);
    if (d && d.shifts) d.shifts.forEach(function (x) { var i = shiftDateToIso(x && x.date); if (i) days.push(i); });
    var a = arr(payload.ios_multitool_archive);
    if (a && a.forEach) a.forEach(function (w) { (w.shifts || []).forEach(function (x) { var i = shiftDateToIso(x && x.date); if (i) days.push(i); }); });
    var g = payload.ios_flame_grant;
    if (g && g.clear) g = null;
    return compute(days, g, todayIsoLocal(), 0);
  }

  /* ---------- разметка огонька ---------- */
  var P_OUT = 'M50 4 C52 18 62 28 72 42 C82 56 88 70 86 86 C84 108 68 126 50 126 C32 126 16 108 14 88 C13 74 18 64 25 55 C27 62 31 68 36 70 C34 54 38 36 50 4 Z';
  var P_IN  = 'M50 50 C52 64 64 72 66 90 C67 106 60 118 50 118 C40 118 33 106 34 92 C35 80 44 74 50 50 Z';
  var P_COR = 'M50 86 C54 95 58 101 58 108 C58 115 54 119 50 119 C46 119 42 115 42 108 C42 101 46 95 50 86 Z';

  var uid = 0;
  function flameHTML(extra) {
    var g = 'fg' + (++uid);
    return '<div class="fl' + (extra ? ' ' + extra : '') + '"><div class="fl-pop">' +
      '<div class="fl-glow"></div>' +
      '<div class="fl-body"><svg class="fl-svg" viewBox="0 0 100 130" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="' + g + 'o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--f1)"/><stop offset=".5" style="stop-color:var(--f1)"/><stop offset="1" style="stop-color:var(--f2)"/></linearGradient>' +
        '<linearGradient id="' + g + 'i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--f2)"/><stop offset="1" style="stop-color:var(--f3)"/></linearGradient>' +
      '</defs>' +
      '<path class="fl-o" fill="url(#' + g + 'o)" d="' + P_OUT + '"/><path class="fl-i" fill="url(#' + g + 'i)" d="' + P_IN + '"/><path class="fl-c" d="' + P_COR + '"/>' +
      '</svg></div>' +
      '<div class="fl-sparks"><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '</div></div>';
  }

  /* ---------- стили ---------- */
  var CSS = '' +
  '.flame-root{--f1:#8e8e93;--f2:#6b6b70;--f3:#48484c;--glow:transparent;--k1:.66;--k2:.62;--go:0;--spd:1.1s}' +
  '.flame-root[data-tier="1"]{--f1:#ff8a00;--f2:#ffb81c;--f3:#fff1b0;--glow:#ff9f0a;--k1:.66}' +
  '.flame-root[data-tier="2"]{--f1:#ff7a00;--f2:#ffa30f;--f3:#ffe680;--glow:#ff8a00;--k1:.78}' +
  '.flame-root[data-tier="3"]{--f1:#ff5e00;--f2:#ff9a00;--f3:#ffe27a;--glow:#ff7a00;--k1:.9}' +
  '.flame-root[data-tier="4"]{--f1:#ff4a00;--f2:#ff8f00;--f3:#fff0a0;--glow:#ff6a00;--k1:1}' +
  '.flame-root[data-tier="5"]{--f1:#ff3d00;--f2:#ffb300;--f3:#ffffff;--glow:#ffb300;--k1:1.1}' +
  '.flame-root[data-state="hot"]{--k2:1;--go:.55;--spd:1.1s}' +
  '.flame-root[data-state="warm"]{--k2:.94;--go:.4;--spd:1.3s}' +
  '.flame-root[data-state="weak"]{--k2:.72;--go:.2;--spd:1.9s}' +
  '.flame-root[data-state="ember"]{--k2:.48;--f1:#4a1a10;--f2:#a8350c;--f3:#ff7a1a;--glow:#ff4d00;--go:.16;--spd:2.4s}' +
  '.flame-root[data-state="dead"]{--k1:.9;--k2:.9;--f1:#6e6e75;--f2:#38383d;--f3:#2a2a2e;--glow:transparent;--go:0}' +

  '.fl{--u:26px;position:relative;width:var(--u);height:calc(var(--u)*1.3);flex-shrink:0;display:block}' +
  '.fl-pop{position:absolute;inset:0;transform-origin:50% 100%}' +
  '.fl-body{position:absolute;inset:0;transform-origin:50% 100%;transform:scale(calc(var(--k1)*var(--k2)));' +
    'transition:transform .9s cubic-bezier(.34,1.56,.64,1)}' +
  '.fl-svg{width:100%;height:100%;overflow:visible;display:block;filter:drop-shadow(0 0 calc(var(--u)*.16) var(--glow))}' +
  '.fl-svg path{transform-box:fill-box;transform-origin:50% 100%;transition:fill .8s}' +
  '.fl-o{animation:flk var(--spd) ease-in-out infinite alternate}' +
  '.fl-i{animation:flk calc(var(--spd)*.8) ease-in-out infinite alternate-reverse}' +
  '.fl-c{fill:var(--f3);animation:flk calc(var(--spd)*.65) ease-in-out infinite alternate}' +
  '@keyframes flk{0%{transform:scale(1,1) skewX(0)}35%{transform:scale(.96,1.06) skewX(-2.5deg)}70%{transform:scale(1.03,.97) skewX(2deg)}100%{transform:scale(.98,1.04) skewX(-1deg)}}' +
  '.fl-glow{position:absolute;left:-60%;right:-60%;top:10%;bottom:-25%;border-radius:50%;pointer-events:none;' +
    'background:radial-gradient(closest-side,var(--glow),transparent);opacity:var(--go);filter:blur(calc(var(--u)*.12));animation:flg 2.2s ease-in-out infinite alternate;transition:opacity .8s}' +
  '@keyframes flg{from{transform:scale(.9)}to{transform:scale(1.1)}}' +

  '.fl-sparks{position:absolute;inset:0;pointer-events:none;display:none}' +
  '.fl-sparks i{position:absolute;bottom:55%;width:calc(var(--u)*.06);height:calc(var(--u)*.06);border-radius:50%;background:var(--f3);box-shadow:0 0 calc(var(--u)*.08) var(--f2);opacity:0;animation:fls 1.9s ease-out infinite}' +
  '.fl-sparks i:nth-child(1){left:38%;animation-delay:0s}.fl-sparks i:nth-child(2){left:58%;animation-delay:.5s}' +
  '.fl-sparks i:nth-child(3){left:46%;animation-delay:1s}.fl-sparks i:nth-child(4){left:66%;animation-delay:1.4s}' +
  '.fl-sparks i:nth-child(5){left:30%;animation-delay:.8s}.fl-sparks i:nth-child(6){left:52%;animation-delay:1.65s}' +
  '@keyframes fls{0%{opacity:0;transform:translate(0,0) scale(1)}15%{opacity:1}100%{opacity:0;transform:translate(calc(var(--u)*.14),calc(var(--u)*-.75)) scale(.3)}}' +
  '.flame-root[data-tier="3"][data-state="hot"] .fl-sparks,.flame-root[data-tier="3"][data-state="warm"] .fl-sparks,' +
  '.flame-root[data-tier="4"][data-state="hot"] .fl-sparks,.flame-root[data-tier="5"][data-state="hot"] .fl-sparks,' +
  '.flame-root[data-tier="4"][data-state="warm"] .fl-sparks,.flame-root[data-tier="5"][data-state="warm"] .fl-sparks{display:block}' +

  '.flame-root[data-state="ember"] .fl-o:not(.fo-t .fl-o),.flame-root[data-state="ember"] .fl-i:not(.fo-t .fl-i){animation:fle 1.7s steps(1) infinite}' +
  '@keyframes fle{0%{opacity:1}12%{opacity:.45}24%{opacity:.9}41%{opacity:.35}58%{opacity:1}76%{opacity:.5}100%{opacity:.8}}' +
  '.flame-root[data-state="dead"] .fl-o:not(.fo-t .fl-o),.flame-root[data-state="dead"] .fl-i:not(.fo-t .fl-i),.flame-root[data-state="dead"] .fl-c:not(.fo-t .fl-c){animation:none}' +
  '.flame-root[data-state="dead"] .fl-o:not(.fo-t .fl-o){fill:none;stroke:var(--f1);stroke-width:3.4;stroke-dasharray:7 6;stroke-linejoin:round;stroke-linecap:round;opacity:.85}' +
  '.flame-root[data-state="dead"] .fl-i:not(.fo-t .fl-i),.flame-root[data-state="dead"] .fl-c:not(.fo-t .fl-c){display:none}' +
  '.flame-root[data-state="dead"] .fl-svg:not(.fo-t .fl-svg){filter:none}' +

  '.fl.ignite .fl-pop{animation:flp .75s cubic-bezier(.2,1.4,.4,1)}' +
  '@keyframes flp{0%{transform:scale(.25)}55%{transform:scale(1.28)}100%{transform:scale(1)}}' +
  '.fl.still *{animation:none!important}.fl.still .fl-sparks{display:none!important}' +

  /* кнопка в шапке */
  '.flame-btn{height:36px;min-width:36px;padding:0 11px 0 9px;border-radius:999px;background:var(--card-bg);border:1px solid rgba(255,255,255,.1);' +
    'display:inline-flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .15s}' +
  '.flame-btn:active{transform:scale(.93)}' +
  '.header-actions .flame-btn{height:36px;padding:0 11px 0 8px}' +
  '.flame-btn .fl{--u:20px;margin-bottom:1px}' +
  '.flame-btn .fl-glow,.flame-btn .fl-sparks{display:none!important}' +
  '.flame-btn .fl-svg{filter:none}' +
  '.flame-btn .fl-body{transform:scale(calc(.92*var(--k2)))}' +
  '.flame-medal{display:flex;flex-direction:column;align-items:center;min-width:66px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .15s}' +
  '.flame-medal:active{transform:scale(.94)}' +
  '.flame-medal .fl{--u:42px;margin-bottom:3px}' +
  '.flame-medal .fl-n{font-size:18px;font-weight:800;line-height:1;color:var(--f2);font-variant-numeric:tabular-nums}' +
  '.flame-medal .fl-t{font-size:11px;font-weight:600;line-height:1;margin-top:4px;color:rgba(255,255,255,.62)}' +
  '.flame-medal[data-state="dead"] .fl-n{color:rgba(255,255,255,.55)}' +
  '.flame-btn.chip{height:26px;min-width:0;padding:0 11px 0 8px;gap:5px;background:var(--card-inner,#2c2c2e);border:0}' +
  '.flame-btn.chip .fl{--u:17px}' +
  '.flame-btn.chip .fl-n{font-size:13px;font-weight:700}' +
  '.flame-btn .fl-n{font-size:15px;font-weight:800;line-height:1;color:var(--f2);font-variant-numeric:tabular-nums}' +
  '.flame-btn[data-state="dead"] .fl-n{color:var(--text-sec,#8e8e93)}' +
  '.flame-btn.bump .fl-n{animation:fnb .5s cubic-bezier(.3,1.6,.5,1)}' +
  '@keyframes fnb{0%{transform:scale(1)}40%{transform:scale(1.5)}100%{transform:scale(1)}}' +

  /* окно серии */
  '.fo{position:fixed;inset:0;z-index:20000;display:flex;align-items:flex-end;justify-content:center;padding:16px;' +
    'padding-bottom:calc(16px + env(safe-area-inset-bottom,0px));background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' +
    'opacity:0;pointer-events:none;transition:opacity .25s}' +
  '.fo.on{opacity:1;pointer-events:auto}' +
  '.fo-card{position:relative;width:100%;max-width:420px;border-radius:30px;padding:26px 22px 20px;text-align:center;color:var(--text,#fff);' +
    'background:radial-gradient(120% 60% at 50% 0%,color-mix(in srgb,var(--glow) 26%,transparent),transparent 70%),rgba(28,28,30,.82);' +
    'border:1px solid rgba(255,255,255,.12);-webkit-backdrop-filter:blur(26px) saturate(1.6);backdrop-filter:blur(26px) saturate(1.6);' +
    'box-shadow:0 24px 60px rgba(0,0,0,.55);transform:translateY(40px) scale(.97);transition:transform .45s cubic-bezier(.2,1.2,.3,1)}' +
  '.fo.on .fo-card{transform:none}' +
  '.fo-x{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:var(--text-sec,#8e8e93);display:flex;align-items:center;justify-content:center;cursor:pointer}' +
  '.fo-x svg{width:16px;height:16px;fill:currentColor}' +
  '.fo-stage{position:relative;height:196px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px}' +
  '.fo-stage .fl{--u:140px}' +
  '.fo-card[data-state="dead"] .fo-stage{height:160px}.fo-card[data-state="dead"] .fo-stage .fl{--u:112px}.fo-card[data-state="dead"] .fo-prog{display:none}' +
  '.fo-num{font-size:64px;font-weight:800;line-height:1;margin-top:6px;color:var(--f2);font-variant-numeric:tabular-nums;transition:color .8s}' +
  '.flame-root[data-state="dead"] .fo-num{color:var(--text-sec,#8e8e93)}' +
  '.fo-num.bump{animation:fnb .6s cubic-bezier(.3,1.6,.5,1)}' +
  '.fo-cap{font-size:17px;font-weight:600;margin-top:4px}' +
  '.fo-status{font-size:14px;line-height:1.35;color:var(--text-sec,#8e8e93);margin:8px auto 0;max-width:290px;min-height:38px}' +
  '.fo-prog{margin-top:14px}' +
  '.fo-bar{height:8px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}' +
  '.fo-bar i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,var(--f1),var(--f2));transition:width 1s cubic-bezier(.3,1,.4,1)}' +
  '.fo-next{font-size:13px;color:var(--text-sec,#8e8e93);margin-top:7px}' +
  '.fo-tiers{display:flex;justify-content:space-between;gap:4px;margin-top:16px}' +
  '.fo-t{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;color:var(--text-sec,#8e8e93)}' +
  '.fo-t .fl-svg{filter:drop-shadow(0 0 3px var(--glow))}' +
  '.fo-t .fl{--u:24px}.fo-t.off .fl{filter:grayscale(1);opacity:.3}.fo-t.cur{color:var(--text,#fff);font-weight:700}' +
  '.fo-t b{font-weight:700;font-size:12px}' +
  '.fo-best{font-size:13px;color:var(--text-sec,#8e8e93);margin-top:14px}' +
  '.fo-btn{margin-top:14px;width:100%;height:50px;border-radius:16px;border:0;background:var(--accent-orange,#ff9f0a);color:#000;font-size:16px;font-weight:700;cursor:pointer}' +
  '.fo-btn:active{transform:scale(.98)}' +
  '.fo-burst{position:absolute;left:50%;bottom:34%;width:0;height:0;pointer-events:none}' +
  '.fo-burst i{position:absolute;width:7px;height:7px;margin:-3px;border-radius:50%;background:var(--f2);box-shadow:0 0 8px var(--f1);animation:fob .9s cubic-bezier(.1,.8,.3,1) forwards}' +
  '@keyframes fob{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0}}' +
  '@media (prefers-reduced-motion:reduce){.fl *,.fl-pop,.fl-glow{animation:none!important}.fo-burst{display:none}}';

  function injectCSS() {
    if (document.getElementById('flameCss')) return;
    var st = document.createElement('style');
    st.id = 'flameCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- кнопки в шапке ---------- */
  function medalLabel(f) {
    if (f.state === 'weak') return 'слабеет';
    if (f.state === 'ember') return 'тлеет';
    if (f.state === 'dead') return f.best ? 'потух' : 'не горит';
    return f.tier ? TIERS[f.tier - 1].name : '';
  }
  function renderMinis() {
    var nodes = document.querySelectorAll('[data-flame-mini]');
    if (!nodes.length) return;
    var f = info();
    var sig = f.tier + '|' + f.state + '|' + f.count;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute('data-sig') === sig) continue;
      var mode = el.getAttribute('data-flame-mini');
      el.classList.add('flame-root');
      if (mode === 'medal') el.classList.add('flame-medal');
      else { el.classList.add('flame-btn'); if (mode === 'chip') el.classList.add('chip'); }
      el.setAttribute('data-tier', f.tier);
      el.setAttribute('data-state', f.state);
      el.setAttribute('data-sig', sig);
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', 'Серия смен: ' + f.count);
      el.innerHTML = flameHTML() + '<span class="fl-n">' + f.count + '</span>' +
        (mode === 'medal' ? '<span class="fl-t">' + medalLabel(f) + '</span>' : '');
    }
  }

  /* ---------- окно серии ---------- */
  var ov = null;
  var giftNote = null;

  function statusText(f) {
    if (f.state === 'hot')   return 'Горит! Сегодняшняя смена внесена. Заходи завтра, чтобы огонь рос.';
    if (f.state === 'warm')  return 'Сегодня смену ещё не вносил. Внеси — и огонь разгорится сильнее.';
    if (f.state === 'weak')  return 'Огонь слабеет — смен нет уже 2 дня. Внеси смену, пока не стало хуже.';
    if (f.state === 'ember') return 'Тлеет! Смен нет 3 дня. Внеси смену сегодня, иначе огонь потухнет.';
    return f.best ? 'Огонь потух. Внеси смену — зажжёшь заново и побьёшь рекорд.' : 'Внеси первую смену — огонь зажжётся.';
  }

  function ensureOverlay() {
    if (ov) return ov;
    injectCSS();
    ov = document.createElement('div');
    ov.className = 'fo';
    ov.innerHTML =
      '<div class="fo-card flame-root">' +
        '<button class="fo-x" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' +
        '<div class="fo-stage">' + flameHTML() + '<div class="fo-burst"></div></div>' +
        '<div class="fo-num">0</div>' +
        '<div class="fo-cap"></div>' +
        '<div class="fo-status"></div>' +
        '<div class="fo-prog"><div class="fo-bar"><i></i></div><div class="fo-next"></div></div>' +
        '<div class="fo-tiers"></div>' +
        '<div class="fo-best"></div>' +
        '<button class="fo-btn"></button>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeFlame(); });
    ov.querySelector('.fo-x').addEventListener('click', closeFlame);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeFlame(); closeGrant(); } });
    return ov;
  }

  function fillModal(f, animateFrom) {
    var card = ov.querySelector('.fo-card');
    card.setAttribute('data-tier', f.tier);
    card.setAttribute('data-state', f.state);

    var numEl = ov.querySelector('.fo-num');
    if (animateFrom != null && animateFrom !== f.count) {
      var t0 = null, from = animateFrom, to = f.count;
      numEl.classList.remove('bump'); void numEl.offsetWidth; numEl.classList.add('bump');
      (function step(t) {
        if (t0 === null) t0 = t;
        var p = Math.min(1, (t - t0) / 800);
        numEl.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      })(performance.now());
    } else {
      numEl.textContent = f.count;
    }

    ov.querySelector('.fo-cap').textContent = f.count
      ? plural(f.count, ['смена', 'смены', 'смен']) + ' подряд'
      : 'огонь не горит';
    ov.querySelector('.fo-status').textContent = giftNote || statusText(f);

    var cur = f.tier ? TIERS[f.tier - 1].min : 0;
    var next = TIERS[f.tier];
    var bar = ov.querySelector('.fo-bar i');
    var nextEl = ov.querySelector('.fo-next');
    if (!f.count) { bar.style.width = '0%'; nextEl.textContent = 'До «' + TIERS[0].name + '» — одна смена'; }
    else if (next) {
      bar.style.width = Math.round((f.count - cur) / (next.min - cur) * 100) + '%';
      var left = next.min - f.count;
      nextEl.textContent = 'До «' + next.name + '» ещё ' + left + ' ' + plural(left, ['смена', 'смены', 'смен']);
    } else { bar.style.width = '100%'; nextEl.textContent = 'Максимальный уровень — «Инферно»'; }

    var tiers = '';
    for (var i = 0; i < TIERS.length; i++) {
      var cls = 'fo-t flame-root' + (f.tier > i ? '' : ' off') + (f.tier === i + 1 ? ' cur' : '');
      tiers += '<div class="' + cls + '" data-tier="' + (i + 1) + '" data-state="hot">' + flameHTML('still') +
        '<span>' + TIERS[i].name + '</span><b>' + TIERS[i].min + '+</b></div>';
    }
    ov.querySelector('.fo-tiers').innerHTML = tiers;

    ov.querySelector('.fo-best').textContent = f.best ? 'Рекорд: ' + f.best + ' ' + plural(f.best, ['смена', 'смены', 'смен']) + ' подряд' : '';

    var btn = ov.querySelector('.fo-btn');
    if (f.state === 'hot') {
      btn.textContent = 'Отлично';
      btn.onclick = closeFlame;
    } else {
      btn.textContent = 'Внести смену';
      btn.onclick = function () { closeFlame(); try { openScreen('screenShifts'); } catch (e) {} };
    }
  }

  function burst() {
    var box = ov.querySelector('.fo-burst');
    var h = '';
    for (var i = 0; i < 18; i++) {
      var a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 90;
      h += '<i style="--dx:' + Math.round(Math.cos(a) * r) + 'px;--dy:' + Math.round(Math.sin(a) * r - 40) + 'px;animation-delay:' + Math.round(Math.random() * 120) + 'ms"></i>';
    }
    box.innerHTML = h;
    setTimeout(function () { box.innerHTML = ''; }, 1400);
  }

  function openFlame(opts) {
    ensureOverlay();
    var f = info();
    giftNote = (opts && opts.gift)
      ? 'Тебе выдали огонёк: ' + f.count + ' ' + plural(f.count, ['смена', 'смены', 'смен']) + ' подряд. Вноси смены, чтобы он рос.'
      : null;
    var from = opts && opts.from;
    var flEl = ov.querySelector('.fo-stage .fl');
    if (from) {
      fillModal(from, null);                       // сначала как было
      ov.classList.add('on');
      setTimeout(function () {                     // потом разгорается
        fillModal(f, from.count);
        flEl.classList.remove('ignite'); void flEl.offsetWidth; flEl.classList.add('ignite');
        burst();
        try { if (navigator.vibrate) navigator.vibrate([25, 35, 25]); } catch (e) {}
      }, 520);
    } else {
      fillModal(f, null);
      ov.classList.add('on');
    }
  }
  function closeFlame() { if (ov) ov.classList.remove('on'); }

  /* ---------- вызывается из addShift ---------- */
  function flameSnapshot() { return info(); }
  function flameAfterAdd(before) {
    renderMinis();
    var now = info();
    if (!before) return;
    if (now.count > before.count || (before.state !== 'hot' && now.state === 'hot')) {
      openFlame({ from: before });
    } else {
      var m = document.querySelectorAll('[data-flame-mini]');
      for (var i = 0; i < m.length; i++) m[i].classList.add('bump');
      setTimeout(function () { for (var i = 0; i < m.length; i++) m[i].classList.remove('bump'); }, 600);
    }
  }


  /* ---------- приём выданного огонька (у сотрудника) ---------- */
  function checkGrant() {
    try {
      if (typeof getSession !== 'function' || typeof pullKeyDataFromCloud !== 'function') return;
      var sess = getSession();
      if (!sess || !sess.code) return;
      if (typeof getSbConfig === 'function' && !getSbConfig()) return;
      pullKeyDataFromCloud(sess.code).then(function (remote) {
        var g = remote && remote.ios_flame_grant;
        if (!g || !g.id) return;
        if (localStorage.getItem('ios_flame_grant_seen') === String(g.id)) return;
        localStorage.setItem('ios_flame_grant_seen', String(g.id));
        var before = info();
        if (g.clear) { localStorage.removeItem('ios_flame_grant'); renderMinis(); return; }
        localStorage.setItem('ios_flame_grant', JSON.stringify(g));
        renderMinis();
        openFlame({ from: before, gift: true });
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- root: выдача огонька ---------- */
  var gov = null, gSel = null, gCount = 7;
  var STATE_RU = { hot: 'горит', warm: 'тёплый', weak: 'слабеет', ember: 'тлеет', dead: 'потух' };

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var GCSS = '' +
  '.fg-card{max-width:440px;max-height:88vh;display:flex;flex-direction:column;text-align:left;padding:22px 18px 18px}' +
  '.fg-h{font-size:21px;font-weight:800;margin:0 40px 2px 4px}' +
  '.fg-sub{font-size:13px;color:var(--text-sec,#8e8e93);margin:0 4px 12px}' +
  '.fg-list{overflow-y:auto;flex:1;min-height:90px;max-height:38vh;margin:0 -6px;padding:0 6px;display:flex;flex-direction:column;gap:6px}' +
  '.fg-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.06);border:1.5px solid transparent;cursor:pointer;transition:border-color .15s,background .15s}' +
  '.fg-row.sel{border-color:var(--accent-orange,#ff9f0a);background:rgba(255,159,10,.12)}' +
  '.fg-row .fl{--u:26px}' +
  '.fg-mid{flex:1;min-width:0}.fg-nm{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '.fg-cd{font-size:12px;color:var(--text-sec,#8e8e93);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '.fg-r{text-align:right;flex-shrink:0}.fg-n{font-size:20px;font-weight:800;color:var(--f2);line-height:1;font-variant-numeric:tabular-nums}' +
  '.fg-row .flame-root[data-state="dead"] .fg-n,.fg-row[data-state="dead"] .fg-n{color:var(--text-sec,#8e8e93)}' +
  '.fg-st{font-size:11px;color:var(--text-sec,#8e8e93);margin-top:3px}' +
  '.fg-ctl{margin-top:14px;display:flex;flex-direction:column;gap:10px}' +
  '.fg-step{display:flex;align-items:center;gap:10px}' +
  '.fg-b{width:46px;height:46px;border-radius:14px;border:0;background:rgba(255,255,255,.1);color:var(--text,#fff);font-size:24px;font-weight:600;cursor:pointer}' +
  '.fg-b:active{transform:scale(.94)}' +
  '.fg-in{flex:1;height:46px;border-radius:14px;border:0;background:rgba(255,255,255,.08);color:var(--text,#fff);font-size:22px;font-weight:800;text-align:center;min-width:0}' +
  '.fg-chips{display:flex;gap:6px}.fg-chip{flex:1;height:34px;border-radius:12px;border:0;background:rgba(255,255,255,.08);color:var(--text,#fff);font-size:14px;font-weight:600;cursor:pointer}' +
  '.fg-chip.on{background:var(--accent-orange,#ff9f0a);color:#000}' +
  '.fg-act{display:flex;gap:8px}.fg-act .fo-btn{margin-top:0;width:auto;min-width:0;flex:1 1 0;white-space:nowrap}' +
  '.fg-act .fg-off{flex:0 0 100px;background:rgba(255,255,255,.1);color:var(--text,#fff)}' +
  '.fg-act .fo-btn[disabled]{opacity:.4}' +
  '.fg-msg{font-size:13px;color:var(--text-sec,#8e8e93);padding:14px 4px}';

  function ensureGrantOverlay() {
    if (gov) return gov;
    injectCSS();
    if (!document.getElementById('flameCss2')) {
      var st = document.createElement('style'); st.id = 'flameCss2'; st.textContent = GCSS; document.head.appendChild(st);
    }
    gov = document.createElement('div');
    gov.className = 'fo';
    gov.innerHTML =
      '<div class="fo-card fg-card">' +
        '<button class="fo-x" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' +
        '<h3 class="fg-h">Выдача огонька</h3>' +
        '<div class="fg-sub">Выбери аккаунт и задай, сколько смен подряд у него горит. Дальше огонь живёт как обычный.</div>' +
        '<div class="fg-list" id="fgList"></div>' +
        '<div class="fg-ctl">' +
          '<div class="fg-step"><button class="fg-b" data-d="-1" aria-label="Меньше">−</button>' +
            '<input class="fg-in" id="fgIn" type="number" inputmode="numeric" min="1" max="365" value="7">' +
            '<button class="fg-b" data-d="1" aria-label="Больше">+</button></div>' +
          '<div class="fg-chips"><button class="fg-chip" data-v="3">3</button><button class="fg-chip on" data-v="7">7</button>' +
            '<button class="fg-chip" data-v="14">14</button><button class="fg-chip" data-v="30">30</button></div>' +
          '<div class="fg-act"><button class="fo-btn" id="fgGo" disabled>Выдать</button>' +
            '<button class="fo-btn fg-off" id="fgOff" disabled>Снять</button></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(gov);
    gov.addEventListener('click', function (e) { if (e.target === gov) closeGrant(); });
    gov.querySelector('.fo-x').addEventListener('click', closeGrant);
    var inp = gov.querySelector('#fgIn');
    function setCount(v) {
      v = Math.max(1, Math.min(365, parseInt(v, 10) || 1)); gCount = v; inp.value = v;
      [].forEach.call(gov.querySelectorAll('.fg-chip'), function (c) { c.classList.toggle('on', +c.getAttribute('data-v') === v); });
      syncGrantBtn();
    }
    inp.addEventListener('input', function () { var v = parseInt(inp.value, 10); if (v > 0) { gCount = Math.min(365, v); [].forEach.call(gov.querySelectorAll('.fg-chip'), function (c) { c.classList.toggle('on', +c.getAttribute('data-v') === gCount); }); syncGrantBtn(); } });
    inp.addEventListener('blur', function () { setCount(inp.value); });
    [].forEach.call(gov.querySelectorAll('.fg-b'), function (b) { b.addEventListener('click', function () { setCount(gCount + (+b.getAttribute('data-d'))); }); });
    [].forEach.call(gov.querySelectorAll('.fg-chip'), function (b) { b.addEventListener('click', function () { setCount(+b.getAttribute('data-v')); }); });
    gov.querySelector('#fgGo').addEventListener('click', function () { doGrant(false); });
    gov.querySelector('#fgOff').addEventListener('click', function () { doGrant(true); });
    return gov;
  }
  function syncGrantBtn() {
    if (!gov) return;
    var go = gov.querySelector('#fgGo'), off = gov.querySelector('#fgOff');
    go.disabled = !gSel; off.disabled = !gSel;
    go.textContent = gSel ? 'Выдать ' + gCount : 'Выдать';
  }
  function closeGrant() { if (gov) gov.classList.remove('on'); }

  function grantRow(code, name, sub, f) {
    return '<div class="fg-row flame-root' + (gSel === code ? ' sel' : '') + '" data-code="' + esc(code) + '" data-tier="' + f.tier + '" data-state="' + f.state + '">' +
      flameHTML('still') +
      '<div class="fg-mid"><div class="fg-nm">' + esc(name) + '</div><div class="fg-cd">' + esc(sub) + '</div></div>' +
      '<div class="fg-r"><div class="fg-n">' + f.count + '</div><div class="fg-st">' + STATE_RU[f.state] + '</div></div></div>';
  }

  function loadGrantList() {
    var box = gov.querySelector('#fgList');
    var local = info();
    var head = grantRow('__local', 'Это устройство', 'проверить на себе', local);
    box.innerHTML = head + '<div class="fg-msg">Гружу аккаунты…</div>';
    bindRows();
    if (typeof sbFetch !== 'function') return;
    Promise.all([
      sbFetch('access_keys?select=*&order=created_at.desc').catch(function () { return null; }),
      sbFetch('key_data?select=code,payload').catch(function () { return []; })
    ]).then(function (r) {
      var keys = r[0], rows = r[1] || [];
      if (!keys) { box.innerHTML = head + '<div class="fg-msg">Не удалось загрузить аккаунты — проверь базу.</div>'; bindRows(); return; }
      var by = {}; rows.forEach(function (x) { by[x.code] = x.payload || {}; });
      var h = head;
      keys.forEach(function (k) {
        var f = flameFromPayload(by[k.code]);
        h += grantRow(k.code, k.name || 'Без имени', k.code + (k.active === false ? ' · выкл' : ''), f);
      });
      if (!keys.length) h += '<div class="fg-msg">Ключей пока нет.</div>';
      box.innerHTML = h;
      bindRows();
    });
  }
  function bindRows() {
    [].forEach.call(gov.querySelectorAll('.fg-row'), function (row) {
      row.addEventListener('click', function () {
        gSel = row.getAttribute('data-code');
        [].forEach.call(gov.querySelectorAll('.fg-row'), function (x) { x.classList.toggle('sel', x === row); });
        syncGrantBtn();
      });
    });
    syncGrantBtn();
  }

  function doGrant(clear) {
    if (!gSel) return;
    var toast = function (t) { try { showToast(t, true); } catch (e) {} };
    var g = clear ? { id: Date.now(), clear: true } : { id: Date.now(), count: gCount, date: todayIsoLocal() };
    if (gSel === '__local') {
      if (clear) localStorage.removeItem('ios_flame_grant'); else localStorage.setItem('ios_flame_grant', JSON.stringify(g));
      renderMinis(); loadGrantList();
      toast(clear ? 'Выдача снята' : 'Огонёк выдан: ' + gCount);
      return;
    }
    if (typeof patchKeyPayload !== 'function') return toast('Нет связи с базой');
    var go = gov.querySelector('#fgGo'); go.disabled = true;
    patchKeyPayload(gSel, function (p) { p.ios_flame_grant = g; }).then(function () {
      toast(clear ? 'Выдача снята' : 'Огонёк выдан: ' + gCount);
      try { logAction(clear ? 'снял выдачу огонька' : 'выдал огонёк ' + gCount, gSel); } catch (e) {}
      loadGrantList();
    }).catch(function () { toast('Не получилось записать в базу'); syncGrantBtn(); });
  }

  function openFlameGrant() {
    ensureGrantOverlay();
    gSel = null; syncGrantBtn();
    gov.classList.add('on');
    loadGrantList();
  }

  /* ---------- подключение ---------- */
  window.renderStreak = renderMinis;
  window.showStreakToast = function () { openFlame(); };
  window.openFlame = openFlame;
  window.closeFlame = closeFlame;
  window.flameSnapshot = flameSnapshot;
  window.flameAfterAdd = flameAfterAdd;
  window.flameInfo = info;
  window.flameHTML = flameHTML;
  window.openFlameGrant = openFlameGrant;
  window.closeFlameGrant = closeGrant;

  ['saveData', 'saveArchive'].forEach(function (name) {
    var orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(renderMinis, 0);
      return r;
    };
  });

  injectCSS();
  renderMinis();
  setTimeout(renderMinis, 300);
  setInterval(renderMinis, 60000);
  setTimeout(checkGrant, 3000);
  setInterval(checkGrant, 20000);
  window.addEventListener('focus', checkGrant);              // новый день — огонь слабеет без перезагрузки
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { renderMinis(); checkGrant(); } });
})();
