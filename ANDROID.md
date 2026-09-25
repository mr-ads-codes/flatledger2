# FlatLedger2 for Android

The Android app is a Capacitor wrapper around the FlatLedger2 interface. It connects to `https://flatledger2.mr-ads.chatgpt.site/api/flatledger`, which belongs to the separate FlatLedger2 Sites project and D1 database.

Application ID: `com.mradscodes.flatledger2`

Install Node.js 22 or newer and Android Studio. Run `npm ci` and `npm run android:sync` in this project, then open `android/` in Android Studio. Build a debug APK or a signed release there. The debug APK is normally written to `android/app/build/outputs/apk/debug/app-debug.apk`.

The database starts empty. Members are added separately to the FlatLedger2 database; the Android package does not copy or reset data.
