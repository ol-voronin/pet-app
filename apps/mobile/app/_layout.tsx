import '@/shared/i18n';
import {
  Geologica_400Regular,
  Geologica_500Medium,
  Geologica_600SemiBold,
  Geologica_700Bold,
  Geologica_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/geologica';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { session, useSession } from '@/features/auth';
import { queryClient } from '@/shared/api/queryClient';
import { SENTRY_DSN } from '@/shared/config';
import { initErrorReporting } from '@/shared/observability/errors';
import { useTheme } from '@/shared/ui';

// Once per app start; a no-op until a DSN is configured.
void initErrorReporting(SENTRY_DSN, __DEV__ ? 'development' : 'production');

export default function RootLayout() {
  const status = useSession((s) => s.status);
  const { colors, fonts } = useTheme();
  // Text names these families directly; render nothing that uses them before they exist.
  const [fontsLoaded, fontError] = useFonts({
    Geologica_400Regular,
    Geologica_500Medium,
    Geologica_600SemiBold,
    Geologica_700Bold,
    Geologica_800ExtraBold,
  });

  useEffect(() => {
    void session.restore();
  }, []);

  if (status === 'loading' || (!fontsLoaded && !fontError)) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const signedIn = status === 'signedIn';
  // Pets and invite screens sit on top of the tabs with a header and a back button.
  const petScreen = {
    headerShown: true,
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.text,
    headerTitleStyle: { fontFamily: fonts.bold },
    headerBackButtonDisplayMode: 'minimal',
  } as const;
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="pets/new" options={petScreen} />
          {/* Full-screen map with its own close button (design canvas «6а»). */}
          <Stack.Screen name="places/new" options={{ headerShown: false }} />
          {/* Draws its own top bar (design canvas «UI 3 · Медкартка улюбленця»). */}
          <Stack.Screen name="pets/[petId]/index" options={{ headerShown: false }} />
          <Stack.Screen name="pets/[petId]/edit" options={petScreen} />
          <Stack.Screen name="invite/new" options={petScreen} />
          <Stack.Screen name="invite/enter" options={petScreen} />
          <Stack.Screen name="profile/delete-account" options={petScreen} />
          <Stack.Screen name="ui-kit" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* Open in both states: a signed-out person is sent to sign in and comes back to it. */}
        <Stack.Screen name="invite/[token]" options={petScreen} />
      </Stack>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
