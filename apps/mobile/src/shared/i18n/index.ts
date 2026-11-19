import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, resolveLanguage } from './language';
import en from './locales/en.json';
import uk from './locales/uk.json';

export const resources = { uk: { translation: uk }, en: { translation: en } } as const;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: (typeof resources)['uk'];
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(getLocales().map((l) => l.languageTag)),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
});

export { i18n };
