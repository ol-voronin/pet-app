import Constants from 'expo-constants';

const fromAppConfig: unknown = Constants.expoConfig?.extra?.apiUrl;

/**
 * Base URL of the API. `EXPO_PUBLIC_API_URL` wins (local API: `http://<your-ip>:3000`);
 * otherwise the staging URL from `app.json` → `extra.apiUrl`.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (typeof fromAppConfig === 'string' ? fromAppConfig : '');
