export const SUPPORTED_LANGUAGES = ['uk', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'uk';

function isSupported(code: string): code is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code);
}

/**
 * Picks the UI language from the device's preferred languages (most preferred first).
 * Ukrainian is the default: anything unsupported (including `ru`) falls back to `uk`.
 */
export function resolveLanguage(preferred: readonly (string | null | undefined)[]): Language {
  for (const tag of preferred) {
    const code = tag?.toLowerCase().split(/[-_]/)[0];
    if (code && isSupported(code)) return code;
  }
  return DEFAULT_LANGUAGE;
}
