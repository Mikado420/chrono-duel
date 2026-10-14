/* The online server's address, with no other imports (the strategy wiki uses it without pulling in the game). */
/** Where the online server lives. Set VITE_ONLINE_URL (e.g. wss://chrono-duel-online.<you>.workers.dev) at build time. */
export function serverUrl(): string | null {
  try {
    // local development only: ?server=ws://localhost:8787
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (local) {
      const q = new URLSearchParams(location.search).get('server');
      if (q) sessionStorage.setItem('cd.server', q);
      const v = q || sessionStorage.getItem('cd.server');
      if (v) return v.replace(/\/$/, '');
    }
  } catch { /* storage blocked: fall through to the build-time value */ }
  const env = (import.meta as unknown as { env?: { VITE_ONLINE_URL?: string } }).env?.VITE_ONLINE_URL;
  return env ? env.replace(/\/$/, '') : null;
}
