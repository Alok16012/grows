# Growus Dialer (Android)

A small Android app for telecallers. It shows the ERP's own **Call Dialer** screens (`/dialer`) and adds the phone-side features a browser can't do:

- **Click-to-call:** someone clicks *Call* in the ERP on a laptop, and their paired phone dials within a few seconds.
- **Call sync:** every call made or received on the phone (number, time, direction, duration) is sent to the ERP after it ends, including calls dialled outside the app.
- **Live status:** "on a call" and idle time for the manager's live view.
- **Outcome reminder:** after a call to a known lead, candidate or employee, a notification asks what happened.

There are no recordings, SMS or contacts. The app is installed directly (sideloaded), **not** through the Play Store, because Google Play does not allow call-log access for apps that aren't the default phone app.

## How it fits together

| Piece | Where |
|---|---|
| Screens (My calls, performance, call log, sales leads, settings) | ERP `app/(dashboard)/dialer`, `components/dialer/*`. Changes go live with a normal deploy, with no app update needed. |
| Phone APIs (pair, sync, request status) | ERP `app/api/dialer/device/*`, authenticated with a device token (`X-Dialer-Token`; only its SHA-256 hash is stored in `DialerDevice`) |
| Background sync, dialing, call state | `DialerService.kt` (foreground service, "Dialer on" notification) |
| WebView + bridges `GrowusDialerPairing`, `GrowusDialer` | `MainActivity.kt`. They answer only the ERP's own pages. |

Check-in rate: every 4 s in working hours (Settings → work start/end, Mon–Sat) and every 60 s outside them, plus straight after each call ends. The server decides the rate (`pollMs` in the sync reply).

## Build

Needs JDK 17 and the Android SDK (platform 35, build-tools 35). Create `local.properties` with `sdk.dir=C:\\path\\to\\Android\\Sdk`.

```
gradlew.bat assembleRelease        # app/build/outputs/apk/release/app-release.apk
gradlew.bat assembleDebug -PerpUrl=https://staging.example.com   # point at another ERP
```

Release signing reads `signing.properties` in this folder (gitignored):

```
storeFile=C:/Users/.../android-signing-PRIVATE/growus-dialer.jks
storePassword=...
keyAlias=growus-dialer
keyPassword=...
```

Keep the key. Every update must be signed with the same key, or phones refuse to install it over the old app.

## Roll out to telecallers

1. Upload the APK somewhere HTTPS (for example a private link) and paste the link in **Call Dialer → Settings → App download link**.
2. On each phone: open the link, allow "install unknown apps" for the browser once, and install.
3. Open **Growus Dialer**, sign in with the ERP login, and allow Phone, Call logs and Notifications. Allow "ignore battery optimisation" when asked.
4. The phone pairs itself. **Call Dialer → My phone** shows it online.

Phones from Xiaomi, Oppo, Vivo and Realme also need **Autostart** switched on for Growus Dialer (Settings → Apps → Growus Dialer). Otherwise the system kills the background sync.

Updating: bump `versionCode` / `versionName` in `app/build.gradle.kts`, build, and replace the file behind the download link.
