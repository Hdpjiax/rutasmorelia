import {CheckCircle, Info, WarningCircle, X} from 'phosphor-react-native';
import {useEffect} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {FadeInDown, FadeOutUp, SlideInDown} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useUiStore, type ToastKind} from '../../stores/ui.store';
import {useTheme} from '../../theme/ThemeProvider';

const TOAST_DURATION_MS = 4500;

function ToastIcon({kind, color}: {kind: ToastKind; color: string}) {
  if (kind === 'success') return <CheckCircle size={20} color={color} weight="fill" />;
  if (kind === 'error') return <WarningCircle size={20} color={color} weight="fill" />;
  return <Info size={20} color={color} weight="fill" />;
}

export function FloatingToast() {
  const insets = useSafeAreaInsets();
  const {theme} = useTheme();
  const message = useUiStore(s => s.message);
  const toastKind = useUiStore(s => s.toastKind);
  const setMessage = useUiStore(s => s.setMessage);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, setMessage]);

  if (!message) return null;

  const accent =
    toastKind === 'error' ? theme.danger : toastKind === 'success' ? theme.success : theme.accent;

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.wrap, {top: insets.top + 56}]}
      pointerEvents="box-none">
      <Animated.View
        entering={FadeInDown.duration(180)}
        style={[
          styles.toast,
          {
            backgroundColor: theme.bgElevated,
            borderColor: accent,
            shadowColor: accent,
          },
        ]}>
        <View style={[styles.iconWrap, {backgroundColor: `${accent}18`}]}>
          <ToastIcon kind={toastKind} color={accent} />
        </View>
        <Text style={[styles.text, {color: theme.text}]} numberOfLines={3}>
          {message}
        </Text>
        <Pressable onPress={() => setMessage(null)} hitSlop={10} accessibilityLabel="Cerrar notificación">
          <X size={16} color={theme.textMuted} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {position: 'absolute', left: 16, right: 16, zIndex: 20},
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 6},
    elevation: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600'},
});