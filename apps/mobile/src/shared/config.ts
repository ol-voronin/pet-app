import Constants from 'expo-constants';
import { resolveSentryDsn } from './observability/errors';

const fromAppConfig: unknown = Constants.expoConfig?.extra?.apiUrl;

/**
 * Base URL of the API. `EXPO_PUBLIC_API_URL` wins (local API: `http://<your-ip>:3000`);
 * otherwise the staging URL from `app.json` → `extra.apiUrl`.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (typeof fromAppConfig === 'string' ? fromAppConfig : '');

/**
 * Sentry DSN for error reports: `EXPO_PUBLIC_SENTRY_DSN` or `app.json` → `extra.sentryDsn`.
 * A DSN is a public client key, not a secret. Empty (the default) switches reporting off.
 */
export const SENTRY_DSN: string = resolveSentryDsn(
  process.env.EXPO_PUBLIC_SENTRY_DSN,
  Constants.expoConfig?.extra?.sentryDsn,
);
