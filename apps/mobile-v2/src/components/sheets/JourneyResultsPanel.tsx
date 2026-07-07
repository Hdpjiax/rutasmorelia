import {
  countJourneyOptions,
  filterJourneyOptions,
  formatJourneyDetail,
  isSameJourneyOption,
  type JourneyOption,
} from '@rutas-morelia/transit-core';
import {Footprints} from 'phosphor-react-native';
import {Keyboard, Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {FadeInRight} from 'react-native-reanimated';
import {useTransitStore} from '../../stores/transit.store';
import {useTheme} from '../../theme/ThemeProvider';
import {EmptyState} from '../ui/EmptyState';
import {Skeleton} from '../ui/Skeleton';

function WalkChip({meters, label, color, muted}: {meters: number; label: string; color: string; muted: string}) {
  return (
    <View style={styles.walkChip}>
      <Footprints size={14} color={color} weight="fill" />
      <Text style={{color: muted, fontSize: 11, fontWeight: '600'}}>{label}</Text>
      <Text style={{color, fontSize: 12, fontWeight: '800'}}>{Math.round(meters)} m</Text>
    </View>
  );
}

export function JourneyResultsPanel() {
  const {theme} = useTheme();
  const journeyOptions = useTransitStore(s => s.journeyOptions);
  const journeyTab = useTransitStore(s => s.journeyTab);
  const journeyLoading = useTransitStore(s => s.journeyLoading);
  const activeJourneyOption = useTransitStore(s => s.activeJourneyOption);
  const setJourneyTab = useTransitStore(s => s.setJourneyTab);
  const selectJourneyOption = useTransitStore(s => s.selectJourneyOption);

  const filtered = filterJourneyOptions(journeyOptions, journeyTab);

  const renderOption = (option: JourneyOption, index: number) => {
    const walkOrigin = Math.round(Number(option.origin_walk_meters || 0));
    const walkDest = Math.round(Number(option.destination_walk_meters || 0));

    return (
      <Animated.View key={`${option.route_id}-${index}`} entering={FadeInRight.delay(index * 50).duration(240)}>
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            selectJourneyOption(option);
          }}
          style={[
            styles.card,
            {
              borderColor: isSameJourneyOption(option, activeJourneyOption) ? theme.accent : theme.surfaceBorder,
              backgroundColor: isSameJourneyOption(option, activeJourneyOption) ? theme.accentMuted : theme.surface,
            },
          ]}>
          <View style={[styles.badge, {backgroundColor: option.route_color || theme.accent}]}>
            <Text style={styles.badgeText}>{option.route_code || option.route_id}</Text>
          </View>
          <View style={{flex: 1, gap: 6}}>
            <Text style={{color: theme.text, fontWeight: '700'}}>{option.route_name}</Text>
            <View style={styles.walkRow}>
              <WalkChip meters={walkOrigin} label="A subida" color={theme.accentAlt} muted={theme.textMuted} />
              <WalkChip meters={walkDest} label="A destino" color={theme.accent} muted={theme.textMuted} />
            </View>
            <Text style={{color: theme.textMuted, fontSize: theme.typography.caption, lineHeight: 17}}>
              {formatJourneyDetail(option)}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {(['direct', 'transfer'] as const).map(tab => {
          const count = countJourneyOptions(journeyOptions, tab);
          const active = journeyTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => setJourneyTab(tab)}
              style={[
                styles.tab,
                {
                  backgroundColor: active ? theme.accentMuted : 'transparent',
                  borderColor: active ? theme.accent : theme.surfaceBorder,
                },
              ]}>
              <Text style={{color: active ? theme.accent : theme.textMuted, fontWeight: '700'}}>
                {tab === 'direct' ? `Directo (${count})` : `Transbordo (${count})`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {journeyLoading ? (
        <View style={{gap: 8, paddingHorizontal: 16}}>
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState title="Sin opciones" subtitle="Prueba otro origen o destino" />
      ) : (
        <View style={{gap: 8, paddingHorizontal: 16, paddingBottom: 12}}>
          {filtered.map(renderOption)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 10},
  tabs: {flexDirection: 'row', gap: 8, paddingHorizontal: 16},
  tab: {flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center'},
  card: {flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12},
  badge: {width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  badgeText: {color: '#FFF', fontWeight: '800', fontSize: 12},
  walkRow: {flexDirection: 'row', gap: 8},
  walkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
  },
});