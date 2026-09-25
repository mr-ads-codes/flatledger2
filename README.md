# FlatLedger2

FlatLedger2 is a separate copy of FlatLedger for another group. It uses the same expense, settlement, report, and member-management interface, with its own Sites project, D1 binding, API origin, session namespace, and Android package.

The new database starts with no members or transactions. No original database data is imported. To create the first administrator, open the new website and enter the administrator's name, a four-digit PIN, and the one-time setup code provided separately to the owner. The code is stored only as a secret in the new Sites project's `FLATLEDGER2_BOOTSTRAP_KEY` environment variable. It works only while the new database has no members. After setup, the administrator signs in and uses **Members & PINs** to add other members. Never point this checkout at the original Sites project or D1 database.

## Identifiers

- Sites project: `appgprj_6ab60b2b929881918c1fd28909616b2c`
- Website and API: `https://flatledger2.mr-ads.chatgpt.site` and `/api/flatledger`
- Android application ID: `com.mradscodes.flatledger2`
- D1 binding: `DB` in this new Sites project

## Development

Install Node.js 22 or newer, then run `npm ci`. Run `npm run dev` for local web development. Run `npm run android:sync` to regenerate the Android web assets and Capacitor configuration before building in Android Studio. No member seed or migration from the original system is included.
