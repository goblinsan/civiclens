export const env = {
  API_BASE_URL: import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:3001',
  TURNSTILE_SITE_KEY: import.meta.env['VITE_TURNSTILE_SITE_KEY'] ?? '',
} as const;
