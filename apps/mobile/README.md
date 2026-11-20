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
- `app/` — routes (expo-router). Tabs (MVP): Map (`index`), Pets, Events (stub), Profile.
  `app/(auth)` — sign-in (phone, then code); the root layout shows it until the user is signed in.
- `src/features/auth` — session: tokens in SecureStore, access token refreshed before it expires,
  signed in after a restart without network. Screens read `useSession()`.
- `src/features/pets` — pets home, card and form. Logic lives in plain modules with tests (`form.ts`, `age.ts`,
  `photo.ts`, `queries.ts`); `hooks.ts` and `components/` are thin wrappers. Routes: `app/pets/new`,
  `app/pets/[petId]`, `app/pets/[petId]/edit`.
- `src/features/family` — family access: invite (pick pets and a role, system share sheet), accept by link
  (`app/invite/[token]`, also reachable by pasting the link in Profile), members on the pet card.
  `petapp://invite/<token>` opens the app only in a development or store build, not in Expo Go.
- `src/features/onboarding` — decides whether a signed-in user sees «Додайте улюбленця» (`app/welcome.tsx`) or the
  tabs: shown once, to a user with no pets; the "finished" flag is stored on the device per user.
- `src/shared/api` — HTTP errors (`ApiError`, `NetworkError`) and the TanStack Query cache (cleared on sign-out).
  Signed-in requests go through `src/features/auth/client.ts`, which adds the access token.
- `src/shared/i18n` — i18next; `uk` default, `en` second; device language via expo-localization,
  anything unsupported falls back to `uk`. UI strings only via `t('…')`.
- `src/shared/ui` — design system (tokens + components). No hard-coded colors/spacing elsewhere.
- `src/features/<feature>/` — feature code (api, hooks, components, store).

## API URL
The app calls `extra.apiUrl` from `app.json` (staging). To use a local API:
`EXPO_PUBLIC_API_URL=http://<your-computer-ip>:3000 pnpm -F mobile start`.
`metro.config.js` lets Metro read the workspace packages (`packages/*`) as TypeScript source.

Bundle IDs are placeholders: `app.petapp.mobile` — change before the first store upload.
