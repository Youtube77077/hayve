import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
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
import { detectCountryAndRates } from '../lib/geo';
import { setReturnTo, takeReturnTo } from '../lib/returnTo';
import { loadOnboarding, useOnboarding } from '../features/onboarding/store';
import { guestCanOpen, PUBLIC_ROOTS } from '../features/onboarding/access';
import { deviceStorage } from '../lib/storage';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function AuthGate() {
  const sessionId = useSessionId();
  const segments = useSegments() as string[];
  const pathname = usePathname();
  const router = useRouter();
  const { done } = useOnboarding();
  const root = segments[0];

  useEffect(() => {
    const isPublic = root ? PUBLIC_ROOTS.has(root) : false;
    if (sessionId) {
      if (root === '(auth)') router.replace((takeReturnTo() ?? '/') as never);
      return;
    }
    // First open: onboarding before anything else (the website's landing page stays public).
    if (!done && !isPublic) router.replace('/start');
    // Afterwards: look around freely; pages that need an account ask you to save your setup.
    else if (done && !guestCanOpen(segments, pathname)) {
      setReturnTo(pathname);
      router.replace('/sign-up');
    }
  }, [sessionId, root, pathname, done, router]); // eslint-disable-line react-hooks/exhaustive-deps

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
    Promise.all([initBackend(deviceStorage).catch(() => initBackend(null)), hydrateCart(), loadOnboarding()])
      .finally(() => {
        setReady(true);
        // Country (IP address) and exchange rates, in the background.
        void detectCountryAndRates();
      });
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
                <Stack.Screen name="start" options={{ animation: 'fade' }} />
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
