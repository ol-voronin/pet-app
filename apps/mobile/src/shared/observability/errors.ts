/** The part of the Sentry SDK this app uses. */
export interface ErrorSdk {
  init(options: { dsn: string; environment: string; sendDefaultPii: boolean }): void;
}

export type ErrorSdkLoader = () => Promise<ErrorSdk>;

/** `EXPO_PUBLIC_SENTRY_DSN` wins; otherwise `extra.sentryDsn` from `app.json`. Empty means "off". */
export function resolveSentryDsn(fromEnv: string | undefined, fromAppConfig: unknown): string {
  const dsn = fromEnv ?? (typeof fromAppConfig === 'string' ? fromAppConfig : '');
  return dsn.trim();
}

/**
 * Starts crash and error reporting. Without a DSN it does nothing and the SDK is never loaded,
 * so the app behaves exactly as before. Returns whether reporting is on.
 *
 * Reports carry no user data (`sendDefaultPii: false`): pet names and medical records stay on the device.
 */
export async function initErrorReporting(
  dsn: string,
  environment: string,
  load: ErrorSdkLoader = () => import('@sentry/react-native'),
): Promise<boolean> {
  if (!dsn) return false;
  try {
    const sdk = await load();
    sdk.init({ dsn, environment, sendDefaultPii: false });
    return true;
  } catch {
    // Error reporting must never be the reason the app fails to start.
    return false;
  }
}
