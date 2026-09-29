/** Service worker registration and the "add to home screen" flow. */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export const pwa = {
  /** Running as an installed app (home screen icon), not in a browser tab. */
  get installed(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  },
  get canPrompt(): boolean { return deferred !== null; },
  get isIOS(): boolean { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
  async install(): Promise<boolean> {
    if (!deferred) return false;
    const d = deferred;
    deferred = null;
    await d.prompt();
    const { outcome } = await d.userChoice;
    listeners.forEach((f) => f());
    return outcome === 'accepted';
  },
  onChange(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
};

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  listeners.forEach((f) => f());
});
window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });

/** Registers the service worker (production builds only) and hands it the files already loaded. */
export function registerServiceWorker() {
  const enabled = import.meta.env?.PROD || location.hash.includes('pwa');
  if (!enabled || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(async () => {
      const reg = await navigator.serviceWorker.ready;
      const urls = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.startsWith(location.origin) || /fonts\.(googleapis|gstatic)\.com/.test(u));
      reg.active?.postMessage({ type: 'precache', urls: [...new Set(urls)] });
    }).catch((err) => console.warn('service worker failed', err));
  });
}
