import {StyleSheet, View, type ViewProps} from 'react-native';
import {useTheme} from '../../theme/ThemeProvider';

export function GlassPanel({style, children, ...rest}: ViewProps) {
  const {theme} = useTheme();
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: theme.surface,
          borderColor: theme.surfaceBorder,
          borderRadius: theme.radius.lg,
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    overflow: 'hidden',
  },
});