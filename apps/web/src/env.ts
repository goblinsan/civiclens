export const env = {
  /** Where the API lives. In dev the Vite proxy forwards /api → localhost:3001; in production set VITE_API_BASE_URL. */
  API_BASE_URL: (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, ''),
} as const;
