import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { completeAddPet, useAddPetGate } from '@/features/onboarding/hooks';
import { AddPetEmpty } from '@/features/pets/components/AddPetEmpty';
import { useTheme } from '@/shared/ui';

/**
 * «Додайте улюбленця» — the first screen after the first sign-in when the user has no pets.
 * «Пізніше» leads to the map and the screen is never shown again; the scan is offered later
 * in the empty medical card.
 */
export default function WelcomeScreen() {
  const { colors, spacing } = useTheme();
  const { gate, userId } = useAddPetGate();
  const [leaving, setLeaving] = useState(false);

  // «Пізніше» was tapped: the map is opening, nothing else may navigate from here.
  if (leaving) return null;
  // A pet was added from here: continue to the pets.
  if (gate === 'skip') return <Redirect href="/pets" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
        <AddPetEmpty
          onLater={() => {
            setLeaving(true);
            if (userId) completeAddPet(userId);
            router.replace('/');
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
