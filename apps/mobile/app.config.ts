import type { ExpoConfig } from 'expo/config';
import { palette } from '@precisari/design-tokens';

const config: ExpoConfig = {
  name: 'Precisari',
  slug: 'precisari',
  scheme: 'precisari',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'br.com.precisari.app',
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: 'br.com.precisari.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: palette.ivory },
    edgeToEdgeEnabled: true,
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
