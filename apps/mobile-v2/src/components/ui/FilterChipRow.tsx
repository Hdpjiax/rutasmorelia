import {Bus, CarProfile, Star} from 'phosphor-react-native';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {TransportFilter} from '@rutas-morelia/transit-core';
import {useTheme} from '../../theme/ThemeProvider';

type Props = {
  value: TransportFilter;
  onChange: (filter: TransportFilter) => void;
};

const FILTERS: {id: TransportFilter; label: string; Icon?: typeof Bus}[] = [
  {id: 'all', label: 'Todas'},
  {id: 'camion', label: 'Camión', Icon: Bus},
  {id: 'combi', label: 'Combi', Icon: CarProfile},
  {id: 'fav', label: 'Favoritas', Icon: Star},
];

export function FilterChipRow({value, onChange}: Props) {
  const {theme} = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {FILTERS.map(({id, label, Icon}) => {
        const active = value === id;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.accent : theme.surface,
                borderColor: active ? theme.accent : theme.surfaceBorder,
              },
            ]}>
            {Icon ? <Icon size={16} color={active ? theme.textInverse : theme.accent} weight={active ? 'fill' : 'bold'} /> : null}
            <Text style={{color: active ? theme.textInverse : theme.text, fontWeight: '700', fontSize: 13}}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {gap: 8, paddingHorizontal: 16},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
});