// app/sw.js
/// <reference lib="webworker" />
import { Serwist } from "serwist";

const manifest = self.__SW_MANIFEST ?? [];

// Cache names
const WEBLLM_CACHE = 'webllm-models-v1';
const API_CACHE = 'api-cache-v1';

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

// Helper function to check if URL is a WebLLM model resource
function isWebLLMResource(url) {
  // WebLLM model files are typically from Hugging Face or other CDNs
  return (
    url.includes('huggingface.co') ||
    url.includes('mlc.ai') ||
    url.pathname.includes('.wasm') ||
    url.pathname.endsWith('.bin') ||
    url.pathname.endsWith('.safetensors') ||
    url.pathname.endsWith('.json') && url.pathname.includes('mlc')
  );
}

// Custom fetch handler for WebLLM model caching and API requests
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle WebLLM model resources with cache-first strategy
  if (isWebLLMResource(url)) {
    event.respondWith(
      (async () => {
        try {
          // Try cache first
          const cache = await caches.open(WEBLLM_CACHE);
          const cachedResponse = await cache.match(request);

          if (cachedResponse) {
            console.log('[SW] Serving WebLLM resource from cache:', url.pathname);
            return cachedResponse;
          }

          // If not in cache, fetch from network and cache
          console.log('[SW] Fetching WebLLM resource:', url.pathname);
          const response = await fetch(request);

          // Only cache successful responses
          if (response && response.status === 200) {
            // Clone the response as it can only be consumed once
            const responseToCache = response.clone();
            await cache.put(request, responseToCache);
            console.log('[SW] Cached WebLLM resource:', url.pathname);
          }

          return response;
        } catch (error) {
          console.error('[SW] Error fetching WebLLM resource:', error);
          // Try to return cached version as fallback
          const cache = await caches.open(WEBLLM_CACHE);
          const cachedResponse = await cache.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          throw error;
        }
      })()
    );
    return;
  }

  // Handle API endpoints with network-first strategy
  if (url.pathname.startsWith("/api/") && request.method === "GET") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);

          // Cache successful API responses
          if (response && response.status === 200) {
            const cache = await caches.open(API_CACHE);
            cache.put(request, response.clone());
          }

          return response;
        } catch (error) {
          // Fallback to cache if network fails
          const cache = await caches.open(API_CACHE);
          const cachedResponse = await cache.match(request);
          return cachedResponse ?? new Response(null, { status: 504 });
        }
      })()
    );
  }
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          // Keep current caches, delete old versions
          if (
            cacheName !== WEBLLM_CACHE &&
            cacheName !== API_CACHE &&
            !cacheName.startsWith('serwist-')
          ) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })()
  );
});
