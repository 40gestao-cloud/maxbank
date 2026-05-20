/**
 * Registra o service worker da PWA.
 * Em modo dev (Vite serve) ignoramos para não atrapalhar HMR.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        console.warn('Falha ao registrar service worker:', err);
      });
  });
}
