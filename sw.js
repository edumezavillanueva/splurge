const CACHE_NAME = "splurge-v5";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];


/* =========================================================
   INSTALACIÓN
   ========================================================= */

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});


/* =========================================================
   ACTIVACIÓN
   ========================================================= */

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /*
    Solo gestionamos recursos del propio SPLURGE.
    Las futuras consultas externas —por ejemplo,
    tipo de cambio— no se guardan aquí.
  */

  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then(response => {
          if (
            !response ||
            response.status !== 200 ||
            response.type !== "basic"
          ) {
            return response;
          }

          const copy = response.clone();

          caches
            .open(CACHE_NAME)
            .then(cache =>
              cache.put(request, copy)
            );

          return response;
        })
        .catch(() => {
          /*
            Para navegación offline, intentamos
            devolver la interfaz principal.
          */

          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }

          throw new Error(
            "Recurso no disponible sin conexión."
          );
        });
    })
  );
});
