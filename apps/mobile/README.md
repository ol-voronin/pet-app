# apps/mobile

Expo SDK 58 + expo-router, TypeScript strict. Runs as a **development build** (not Expo Go).

## First run (once per machine)
```bash
npm i -g eas-cli
eas login
cd apps/mobile
eas init                                   # links the Expo project, writes projectId to app.json
eas build --profile development --platform android   # APK to install on a phone/emulator
# iOS (needs Apple Developer account): eas build --profile development --platform ios
```
Or build locally with Android Studio / Xcode: `pnpm -F mobile android` / `pnpm -F mobile ios`.

## Daily
```bash
pnpm -F mobile start     # Metro for the installed development build
```

## Structure
- `app/` — routes (expo-router). Tabs: Map (`index`), Pets, Events, Profile.
- `src/shared/i18n` — i18next; `uk` default, `en` second; device language via expo-localization,
  anything unsupported falls back to `uk`. UI strings only via `t('…')`.
- `src/shared/ui` — design system (tokens + components). No hard-coded colors/spacing elsewhere.
- `src/features/<feature>/` — feature code (api, hooks, components, store).

Bundle IDs are placeholders: `app.petapp.mobile` — change before the first store upload.
