import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Touch feedback the user can feel: a light tap for toggles and selection, a firmer one for the main action,
 * a success / warning pattern when something is saved or refused. Silent where haptics do not exist (web).
 */
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

function run(effect: () => Promise<void>) {
  if (!enabled) return;
  // Feedback must never break the action it accompanies.
  effect().catch(() => undefined);
}

export const feedback = {
  /** Chips, segmented options, tabs. */
  select: () => {
    run(() => Haptics.selectionAsync());
  },
  /** Primary buttons, long press on the map. */
  impact: () => {
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  success: () => {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  warning: () => {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
};
