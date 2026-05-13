const CACHE_NAME = "meinong-portfolio-gallery-v20260513-gallery29";
const CACHEABLE_TYPES = new Set(["basic", "cors", "opaque"]);

const isCacheableRequest = (request) => {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);

  return request.destination === "image" ||
    /\.(?:webp|gif|png|jpe?g|avif)(?:$|\?)/i.test(url.pathname);
};

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("meinong-portfolio-gallery-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (!isCacheableRequest(request)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);

      if (cached) {
        return cached;
      }

      const response = await fetch(request);

      if (CACHEABLE_TYPES.has(response.type) && (response.ok || response.type === "opaque")) {
        cache.put(request, response.clone()).catch(() => {});
      }

      return response;
    })
  );
});
