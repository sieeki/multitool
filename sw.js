/* Мультитул service worker */
const SW_VER = 'mt-sw-1';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(e) {
  var data = { title: 'Мультитул', body: 'Новое уведомление', url: './' };
  try {
    if (e.data) {
      var j = e.data.json();
      if (j.title) data.title = j.title;
      if (j.body) data.body = j.body;
      if (j.url) data.url = j.url;
    }
  } catch (err) {
    try {
      var t = e.data && e.data.text();
      if (t) data.body = t;
    } catch (e2) {}
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './',
      badge: './',
      data: { url: data.url || './' },
      vibrate: [80, 40, 80]
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].focus) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('message', function(e) {
  if (!e.data || e.data.type !== 'notify') return;
  var title = e.data.title || 'Мультитул';
  var body = e.data.body || '';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      data: { url: e.data.url || './' }
    })
  );
});
