import {Bus, Heart, MapTrifold} from 'phosphor-react-native';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {AppTab} from '../../stores/transit.store';
import {useTheme} from '../../theme/ThemeProvider';

type Props = {
  active: AppTab;
  onChange: (tab: AppTab) => void;
};

const TABS: {id: AppTab; label: string; Icon: typeof Bus}[] = [
  {id: 'trip', label: 'Viaje', Icon: MapTrifold},
  {id: 'routes', label: 'Rutas', Icon: Bus},
  {id: 'favorites', label: 'Favoritos', Icon: Heart},
];

export function AppTabBar({active, onChange}: Props) {
  const {theme} = useTheme();

  return (
    <View style={[styles.wrap, {backgroundColor: theme.glass, borderColor: theme.surfaceBorder}]}>
      {TABS.map(({id, label, Icon}) => {
        const selected = active === id;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            style={[
              styles.tab,
              selected && {backgroundColor: theme.accentMuted, borderColor: theme.accent},
            ]}>
            <Icon size={20} color={selected ? theme.accent : theme.textMuted} weight={selected ? 'fill' : 'regular'} />
            <Text style={[styles.label, {color: selected ? theme.accent : theme.textMuted}]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  label: {fontSize: 11, fontWeight: '700'},
});