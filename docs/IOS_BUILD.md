# Building Hayve for iPhone and iPad

## 1. Unsigned IPA for sideloading (set up and working)

`.github/workflows/ios-ipa.yml` runs on every push to `main` or `claude/**`, or manually via **Actions → iOS IPA → Run workflow**. It:

1. installs dependencies, typechecks and runs the backend tests
2. runs `expo prebuild --platform ios` to generate the native Xcode project
3. runs `pod install`
4. runs `xcodebuild -configuration Release -sdk iphoneos` with code signing disabled (the JS bundle is embedded, so the app runs standalone)
5. packages `Payload/Hayve.app` into `Hayve.ipa`
6. uploads it as a workflow artifact **and** publishes a GitHub pre-release `ios-build-N` with the IPA attached

Install it with a sideloading tool:

| Tool | How |
|---|---|
| **AltStore / SideStore** | Open the `.ipa` from Files → share to AltStore/SideStore → install (re-signed with your Apple ID; free accounts need a refresh every 7 days) |
| **Sideloadly** (Mac/PC) | Drag the `.ipa` in, enter your Apple ID, connect your iPhone |
| **Feather / ESign** | Import the `.ipa` and sign it with your certificate |

The bundle identifier is `com.hayve.app`. Some tools change it when re-signing with a free account, which is fine.

Build it yourself on a Mac:

```bash
npm ci
npx expo prebuild --platform ios --clean
cd ios && pod install && cd ..
xcodebuild -workspace ios/Hayve.xcworkspace -scheme Hayve -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO build
mkdir Payload && cp -R build/Build/Products/Release-iphoneos/Hayve.app Payload/ && zip -qry Hayve.ipa Payload
```

Or open `ios/Hayve.xcworkspace` in Xcode, choose your team under **Signing & Capabilities**, select your iPhone and press Run.

## 2. Signed builds with EAS (TestFlight / App Store)

What you need:

- an **Apple Developer Program** membership (€99/year)
- an **Expo account** (`npx expo login`)
- an App Store Connect app record with bundle ID `com.hayve.app`

```bash
npm install -g eas-cli
eas build:configure                     # creates eas.json
eas build --platform ios --profile production
eas submit --platform ios               # uploads to TestFlight
```

EAS can create and manage the distribution certificate and provisioning profile for you. Never commit `.p12`, `.p8` or `.mobileprovision` files; `.gitignore` already excludes them. For CI, store `EXPO_TOKEN` as a GitHub secret.

## iPad

`supportsTablet: true` is set, and `orientation: default` allows landscape. At 768pt and wider the app switches to a sidebar layout with two-column detail screens.
