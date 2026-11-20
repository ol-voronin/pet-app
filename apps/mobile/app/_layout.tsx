import '@/shared/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { session, useSession } from '@/features/auth';
import { queryClient } from '@/shared/api/queryClient';
import { useTheme } from '@/shared/ui';

export default function RootLayout() {
  const status = useSession((s) => s.status);
  const { colors } = useTheme();

  useEffect(() => {
    void session.restore();
  }, []);

  if (status === 'loading') {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const signedIn = status === 'signedIn';
  // Pets screens sit on top of the tabs with a header and a back button.
  const petScreen = {
    headerShown: true,
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.text,
    headerBackButtonDisplayMode: 'minimal',
  } as const;
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="pets/new" options={petScreen} />
          <Stack.Screen name="pets/[petId]/index" options={petScreen} />
          <Stack.Screen name="pets/[petId]/edit" options={petScreen} />
          <Stack.Screen name="ui-kit" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
