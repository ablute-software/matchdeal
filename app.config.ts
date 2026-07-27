// Expo config as code, so the Supabase credentials come from the
// environment at build time instead of sitting as literals in app.json —
// required by the integration adenda.
//
// Only the URL and the ANON key ever reach the mobile client. The anon key
// is designed to be public (RLS is what protects the data), but the SERVICE
// ROLE key must never appear here, in EAS secrets for this app, or anywhere
// else in this repo — it lives only inside the pairing Edge Function.
//
// Local dev: put EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in
// a .env file (gitignored). Builds: set them as EAS environment variables.
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'MatchDeal',
  slug: 'matchdeal',
  scheme: 'matchdeal',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0E3A3F',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'pt.ablute.matchdeal',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0E3A3F',
    },
    package: 'pt.ablute.matchdeal',
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
};

export default config;
