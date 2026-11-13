// app/sw.js
/// <reference lib="webworker" />
import { Serwist } from "serwist";

const manifest = self.__SW_MANIFEST ?? [];

const serwist = new Serwist({
  // The Serwist instance can accept a list of precache entries.
  // Provide the injected manifest so Serwist precaches build output.
  precacheEntries: manifest,
  skipWaiting: true,
  clientsClaim: true,
});

// The Serwist helper wires up install/activate/fetch handlers for you.
// You can still add custom behaviors before or after.
serwist.addEventListeners();

// Optional: extra custom fetch behavior (example: network-first for /api)
// You can still attach native listeners if you need additional logic.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Example: simple network-first for API endpoints (keeps Serwist default handlers intact)
  if (url.pathname.startsWith("/api/") && request.method === "GET") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          // optionally cache response - Serwist's runtime caches may already handle common cases
          return res;
        } catch {
          return caches.match(request) ?? new Response(null, { status: 504 });
        }
      })()
    );
  }
});
