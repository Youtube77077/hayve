import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initBackend } from '../backend/bootstrap';
import { color, Loading, ToastProvider } from '../design';
import { hydrateCart } from '../lib/cart';
import { useSessionId } from '../lib/hooks';
import { deviceStorage } from '../lib/storage';

void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Routes anyone can open without an account (public web pages and shared links). */
const PUBLIC_ROOTS = new Set(['(auth)', 'u', 'product', 'paylink', 'track', 'privacy']);

function AuthGate() {
  const sessionId = useSessionId();
  const segments = useSegments();
  const router = useRouter();
  const root = segments[0] as string | undefined;

  useEffect(() => {
    const isPublic = root ? PUBLIC_ROOTS.has(root) : false;
    if (!sessionId && !isPublic) router.replace('/welcome');
    else if (sessionId && root === '(auth)') router.replace('/');
  }, [sessionId, root, router]);

  return null;
}

export default function RootLayout() {
  const [dataReady, setReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const ready = dataReady && (fontsLoaded || !!fontError);

  useEffect(() => {
    Promise.all([initBackend(deviceStorage).catch(() => initBackend(null)), hydrateCart()])
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          {ready ? (
            <>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: color.bg },
                  animation: Platform.OS === 'web' ? 'none' : 'default',
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                <Stack.Screen name="services" options={{ presentation: 'transparentModal', animation: 'fade' }} />
              </Stack>
              <AuthGate />
            </>
          ) : (
            <View style={{ flex: 1, backgroundColor: color.bg }}>
              <Loading />
            </View>
          )}
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
