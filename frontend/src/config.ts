const env = import.meta.env;

function resolvePublicAppUrl(configured: string | undefined): string {
  if (typeof window === 'undefined') return (configured || '').replace(/\/$/, '');

  const browserOrigin = window.location.origin.replace(/\/$/, '');
  const hostname = window.location.hostname.toLowerCase();
  const isLocalBrowser = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  // When the app is opened through a reachable host (Dev Tunnel, LAN IP,
  // staging, production, reverse proxy, etc.), the browser origin is the
  // only reliable public URL for QR codes. This prevents a build-time
  // localhost value from leaking into QR codes.
  if (!isLocalBrowser) return browserOrigin;

  // Keep the configured value useful for local/device testing where the
  // browser itself is still running on localhost.
  return (configured || browserOrigin).replace(/\/$/, '');
}

export function appOrigin(): string {
  return resolvePublicAppUrl(env.VITE_PUBLIC_APP_URL);
}

export function appUrl(path: string): string {
  const normalized = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
  return `${appOrigin()}${normalized}`;
}

export const CONFIG = {
  env: env.VITE_APP_ENV || 'local',
  apiUrl: env.VITE_API_URL || '/api',
  appName: env.VITE_APP_NAME || 'Youth Quest',
  pwa: env.VITE_ENABLE_PWA !== 'false',
  quickLogin: env.VITE_ENABLE_QUICK_LOGIN === 'true',
  publicAppUrl: resolvePublicAppUrl(env.VITE_PUBLIC_APP_URL),
} as const;
