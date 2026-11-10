import type { ExpoConfig } from 'expo/config';
import { palette } from '@precisari/design-tokens';

/** Store build number (CI run number); must grow on every upload to App Store Connect / Play Console. */
const buildNumber = Number(process.env.APP_BUILD_NUMBER ?? 1);

const config: ExpoConfig = {
  name: 'Precisari',
  slug: 'precisari',
  scheme: 'precisari',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'br.com.precisari.app',
    buildNumber: String(buildNumber),
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
    // Required-reason APIs used by React Native and Expo modules (Apple rejects uploads that omit them).
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1', '0A2A.1', '3B52.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'] },
      ],
    },
  },
  android: {
    package: 'br.com.precisari.app',
    versionCode: buildNumber,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: palette.ivory },
    edgeToEdgeEnabled: true,
    // Not used by the app: each one would have to be declared and justified in the Play Console.
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'],
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    ['expo-notifications', { color: palette.tangerine500 }],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: palette.ivory,
        dark: { image: './assets/splash-icon.png', backgroundColor: palette.navy950 },
      },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
