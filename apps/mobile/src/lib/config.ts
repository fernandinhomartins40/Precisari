/** Public runtime config (EXPO_PUBLIC_* are inlined at bundle time). See apps/mobile/.env.example. */
export const config = {
  mock: process.env.EXPO_PUBLIC_API_MOCK === 'true',
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333',
  webUrl: process.env.EXPO_PUBLIC_WEB_URL ?? 'https://www.precisari.com.br',
} as const;

export const MOCK_BASE_URL = 'https://mock.precisari.local';
