import * as Haptics from 'expo-haptics';
import {useCallback} from 'react';

export function useHaptics() {
  const light = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const medium = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const selection = useCallback(() => {
    void Haptics.selectionAsync();
  }, []);

  const success = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  return {light, medium, selection, success};
}