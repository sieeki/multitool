/* Тайный вход в root: 5 быстрых тапов по заголовку «Мультитул» на главной. */
(function () {
  'use strict';
  var taps = 0, timer = null;
  function bind() {
    var t = document.getElementById('brandTitle');
    if (!t) return;
    t.addEventListener('click', function () {
      taps++;
      clearTimeout(timer);
      timer = setTimeout(function () { taps = 0; }, 2000);
      if (taps >= 5) {
        taps = 0;
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
        try { openCreatorAuthModal(); } catch (e) {}
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();

/* Карточка «Неделя» на главной + мелкие удобства */
(function () {
  'use strict';
  function plural(n, f) { var a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return f[2]; if (b > 1 && b < 5) return f[1]; if (b === 1) return f[0]; return f[2]; }
  function fmt(n) { return Math.round(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' '); }

  function countUp(el, from, to) {
    if (from === to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
    var t0 = null;
    (function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / 650);
      el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }

  function renderHero() {
    var nodes = document.querySelectorAll('[data-week-hero]');
    if (!nodes.length) return;
    var shifts = [];
    try { shifts = getData().shifts || []; } catch (e) {}
    var n = shifts.length, sum = 0, done = false, today = '';
    try { today = todayIsoLocal(); } catch (e) {}
    shifts.forEach(function (s) {
      sum += parseFloat(s.total) || 0;
      try { if (shiftDateToIso(s.date) === today) done = true; } catch (e) {}
    });
    var sig = n + '|' + done;
    [].forEach.call(nodes, function (el) {
      var prev = el._sum || 0;
      if (el.getAttribute('data-sig') !== sig) {
        var dots = '';
        for (var i = 0; i < 5; i++) dots += '<i class="' + (i < n ? 'on' : '') + '"></i>';
        el.innerHTML =
          '<div class="hero-top"><span>Эта неделя</span><span class="hero-dots">' + dots + '</span></div>' +
          '<div class="hero-main"><div class="hero-sum"><b>' + fmt(prev) + '</b><i>₽</i></div>' +
          '<div data-flame-mini="medal" onclick="event.stopPropagation(); openFlame()" title="Серия смен"></div></div>' +
          '<div class="hero-bot"><span>' + (n ? (n <= 5 ? n + ' из 5 смен' : n + ' ' + plural(n, ['смена', 'смены', 'смен'])) : 'Смен пока нет') + '</span>' +
          (done ? '<button class="hero-cta done" onclick="event.stopPropagation()">Сегодня внесена</button>'
                : '<button class="hero-cta" onclick="event.stopPropagation(); openQuickAdd(); setTimeout(function(){ qaOpen(\'shift\'); }, 0)">Внести смену</button>') +
          '</div>';
        el.setAttribute('data-sig', sig);
        try { renderStreak(); } catch (e) {}
      }
      var b = el.querySelector('.hero-sum b');
      if (b) countUp(b, prev, sum);
      el._sum = sum;
    });
  }
  window.renderWeekHero = renderHero;

  ['saveData', 'saveArchive'].forEach(function (name) {
    var orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () { var r = orig.apply(this, arguments); setTimeout(renderHero, 0); return r; };
  });
  setTimeout(renderHero, 0);
  setTimeout(renderHero, 400);
  setInterval(renderHero, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) renderHero(); });

  // Enter в поле выручки = «Добавить смену»
  var t = document.getElementById('shiftTotal');
  if (t) {
    t.setAttribute('enterkeyhint', 'done');
    t.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); try { addShift(); } catch (x) {} t.blur(); } });
  }
})();
