# Growus — Employee Mobile App

A native iOS + Android employee self-service app for Growus, built with
**Expo (React Native) + Expo Router**. It talks to the same Next.js / Supabase
backend the web app uses, via a token-based mobile auth flow.

## Features

- **Login** — Employee ID / email / phone + password (token auth)
- **Home dashboard** — greeting, quick-action grid, today's attendance, last
  salary, pending leaves, quick links
- **Attendance** — live clock, GPS check-in / check-out, weekly summary, history
- **Leave** — balance-by-type summary, history, apply for leave (calendar picker)
- **Payroll** — latest salary slip hero card + expandable monthly breakdowns
- **Expenses** — claim history with totals + raise a new claim (auto-submitted)
- **Documents** — view / open employee documents
- **Notifications** — read + mark-all-read
- **Profile** — details, bank info, quick links, logout

## Brand

Deep corporate navy headers (`#16335B → #0F2747`) with the Growus green accent
(`#1A9E6E`), clean white cards, and soft tinted tiles — defined once in
[`src/theme.ts`](src/theme.ts).

## Running it

```bash
cd mobile
npm install
npx expo start
```

Then scan the QR code with the **Expo Go** app (iOS App Store / Google Play),
or press `i` / `a` for a simulator / emulator.

## Pointing it at your backend

The app defaults to `https://grows-tau.vercel.app`. Override without editing code:

- **Env var:** `EXPO_PUBLIC_API_BASE_URL=https://your-domain.com npx expo start`
- **app.json:** add `expo.extra.apiBaseUrl`
- **Local `next dev`:** use your machine's LAN IP (not `localhost`), e.g.
  `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.5:3000 npx expo start`

> The backend must have `NEXTAUTH_SECRET` set — the mobile login endpoint
> (`/api/mobile/login`) mints a NextAuth-compatible JWT with it, and the
> employee API routes verify the bearer token with the same secret
> (`lib/apiSession.ts`).

## Production builds

Uses [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

App identifiers are set in `app.json` (`com.growus.employee`).
