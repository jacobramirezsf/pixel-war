// Register the offline service worker when the page is served over http(s).
// The game never depends on it; file:// and unsupported browsers just skip it.

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { /* offline caching is optional */ });
  });
}
