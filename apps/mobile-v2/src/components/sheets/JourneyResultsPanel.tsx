import {
  countJourneyOptions,
  filterJourneyOptions,
  formatJourneyDetail,
  type JourneyOption,
} from '@rutas-morelia/transit-core';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Animated, {FadeInRight} from 'react-native-reanimated';
import {useTransitStore} from '../../stores/transit.store';
import {useTheme} from '../../theme/ThemeProvider';
import {EmptyState} from '../ui/EmptyState';
import {Skeleton} from '../ui/Skeleton';

export function JourneyResultsPanel() {
  const {theme} = useTheme();
  const journeyOptions = useTransitStore(s => s.journeyOptions);
  const journeyTab = useTransitStore(s => s.journeyTab);
  const journeyLoading = useTransitStore(s => s.journeyLoading);
  const setJourneyTab = useTransitStore(s => s.setJourneyTab);
  const setActiveRouteId = useTransitStore(s => s.setActiveRouteId);

  const filtered = filterJourneyOptions(journeyOptions, journeyTab);

  const renderOption = (option: JourneyOption, index: number) => (
    <Animated.View key={`${option.route_id}-${index}`} entering={FadeInRight.delay(index * 50).duration(240)}>
      <Pressable
        onPress={() => setActiveRouteId(String(option.route_code || option.route_id))}
        style={[styles.card, {borderColor: theme.surfaceBorder, backgroundColor: theme.bgElevated}]}>
        <View style={[styles.badge, {backgroundColor: option.route_color || theme.accent}]}>
          <Text style={styles.badgeText}>{option.route_code || option.route_id}</Text>
        </View>
        <View style={{flex: 1}}>
          <Text style={{color: theme.text, fontWeight: '700'}}>{option.route_name}</Text>
          <Text style={{color: theme.textMuted, fontSize: theme.typography.caption, marginTop: 4, lineHeight: 18}}>
            {formatJourneyDetail(option)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );

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
        <ScrollView contentContainerStyle={{gap: 8, paddingHorizontal: 16, paddingBottom: 12}}>
          {filtered.map(renderOption)}
        </ScrollView>
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
});