import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../../theme/ThemeProvider';

type Props = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
};

export function EmptyState({title, subtitle, icon}: Props) {
  const {theme} = useTheme();
  return (
    <View style={styles.wrap}>
      {icon}
      <Text style={[styles.title, {color: theme.text, fontSize: theme.typography.subtitle}]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, {color: theme.textMuted, fontSize: theme.typography.body}]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 16},
  title: {fontWeight: '600', textAlign: 'center'},
  subtitle: {textAlign: 'center', lineHeight: 20},
});