import {Heart, MagnifyingGlass, MapPin, UserCircle} from 'phosphor-react-native';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {BrandMark} from './BrandMark';
import {countJourneyOptions} from '@rutas-morelia/transit-core';
import type {AppColorScheme} from '../lib/color-scheme';
import type {DrawerItem, JourneyOption} from '../types/transit';
import {dark, light} from '../theme';

type ThemeColors = typeof light;
type RouteTransportFilter = 'combi' | 'camion';

type RouteDrawerProps = {
  visible: boolean;
  colorScheme: AppColorScheme;
  insets: {top: number; bottom: number};
  loading: boolean;
  journeyOptions: JourneyOption[];
  journeyTab: 'direct' | 'transfer';
  showOnlyFavorites: boolean;
  showCatalogControls: boolean;
  routeTransportFilter: RouteTransportFilter;
  routeSearchQuery: string;
  drawerItems: DrawerItem[];
  activeRouteId: string;
  isRouteFavorited: (routeId: string) => boolean;
  onClose: () => void;
  onNavigateAccount: () => void;
  onToggleFavoritesFilter: () => void;
  onJourneyTabChange: (tab: 'direct' | 'transfer') => void;
  onRouteTransportFilterChange: (filter: RouteTransportFilter) => void;
  onRouteSearchQueryChange: (query: string) => void;
  onSelectItem: (item: DrawerItem) => void;
  onToggleRouteFavorite: (routeId: string) => void;
};

export function RouteDrawer({
  visible,
  colorScheme,
  insets,
  loading,
  journeyOptions,
  journeyTab,
  showOnlyFavorites,
  showCatalogControls,
  routeTransportFilter,
  routeSearchQuery,
  drawerItems,
  activeRouteId,
  isRouteFavorited,
  onClose,
  onNavigateAccount,
  onToggleFavoritesFilter,
  onJourneyTabChange,
  onRouteTransportFilterChange,
  onRouteSearchQueryChange,
  onSelectItem,
  onToggleRouteFavorite,
}: RouteDrawerProps) {
  const colors: ThemeColors = colorScheme === 'dark' ? dark : light;

  const renderDrawerItem = ({item}: {item: DrawerItem}) => {
    const selected = item.kind === 'route' && activeRouteId === item.id;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{selected}}
        onPress={() => onSelectItem(item)}
        style={[
          styles.routeRow,
          {backgroundColor: colors.bg, borderColor: colors.line},
          selected && {backgroundColor: colors.primarySoft, borderColor: colors.primary},
        ]}
      >
        <View style={[styles.routeNumberCircle, {backgroundColor: item.color}]}>
          {item.kind === 'stop' ? (
            <MapPin size={18} color="#FFFFFF" weight="fill" />
          ) : (
            <Text style={styles.routeNumberText}>{item.number}</Text>
          )}
        </View>
        <View style={styles.routeCopy}>
          <Text numberOfLines={1} style={[styles.routeName, {color: colors.ink}]}>
            {item.name}
          </Text>
          <Text style={[styles.routeDetail, {color: colors.muted, lineHeight: 16}]}>{item.detail}</Text>
        </View>
        <View style={styles.routeTrailing}>
          {item.kind === 'route' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Favorito"
              onPress={() => onToggleRouteFavorite(item.id)}
              style={{padding: 6}}
            >
              <Heart
                size={18}
                color={isRouteFavorited(item.id) ? colors.primary : colors.muted}
                weight={isRouteFavorited(item.id) ? 'fill' : 'regular'}
              />
            </Pressable>
          ) : null}
          {item.time ? (
            <Text style={[styles.routeTimeTag, {color: selected ? colors.primary : colors.muted}]}>{item.time}</Text>
          ) : null}
          {item.secondaryTime ? (
            <Text style={[styles.routeFare, {color: colors.muted}]}>{item.secondaryTime}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      hardwareAccelerated
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.drawerContainer}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          style={[
            styles.leftDrawer,
            {
              backgroundColor: colors.bg,
              borderColor: colors.line,
              paddingTop: insets.top + 12,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          <View style={[styles.drawerHeader, {borderColor: colors.line}]}>
            <View style={styles.brandMark}>
              <BrandMark size={32} />
            </View>
            <View style={styles.brandCopy}>
              <Text style={[styles.brandTitle, {color: colors.ink}]}>ViaMorelia</Text>
              <Text style={[styles.brandSubtitle, {color: colors.muted}]}>Movilidad de Morelia</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar menú" onPress={onClose} style={styles.closeBtn}>
              <Text style={{fontWeight: 'bold', fontSize: 16, color: colors.ink}}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.drawerContent}>
            <View style={[styles.drawerActions, {borderBottomColor: colors.line}]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mi cuenta"
                onPress={onNavigateAccount}
                style={[styles.drawerActionRow, styles.drawerActionAccount, {borderColor: colors.line}]}
              >
                <UserCircle size={22} color={colors.ink} />
                <Text style={{color: colors.ink, marginLeft: 8, fontWeight: '500'}}>Mi Cuenta</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Favoritos"
                onPress={onToggleFavoritesFilter}
                style={[
                  styles.drawerActionRow,
                  styles.drawerActionFavorites,
                  {
                    borderColor: colors.line,
                    backgroundColor: showOnlyFavorites ? colors.primarySoft : colors.surface,
                  },
                ]}
              >
                <Heart
                  size={22}
                  color={showOnlyFavorites ? colors.primary : colors.ink}
                  weight={showOnlyFavorites ? 'fill' : 'regular'}
                />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingTitle, {color: colors.ink}]}>Buscando las mejores rutas...</Text>
                <Text style={[styles.loadingSubtitle, {color: colors.muted}]}>
                  Calculando transbordos y caminata óptima en Morelia.
                </Text>
              </View>
            ) : (
              <>
                {showCatalogControls ? (
                  <>
                    <View style={[styles.routeSearchRow, {borderColor: colors.line, backgroundColor: colors.surface}]}>
                      <MagnifyingGlass size={18} color={colors.muted} />
                      <TextInput
                        value={routeSearchQuery}
                        onChangeText={onRouteSearchQueryChange}
                        placeholder="Buscar ruta por nombre o número"
                        placeholderTextColor={colors.muted}
                        style={[styles.routeSearchInput, {color: colors.ink}]}
                        autoCorrect={false}
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={[styles.journeyTabs, {backgroundColor: colors.surface}]} accessibilityRole="tablist">
                      {(['combi', 'camion'] as const).map(tabValue => {
                        const selected = routeTransportFilter === tabValue;
                        return (
                          <Pressable
                            key={tabValue}
                            accessibilityRole="tab"
                            accessibilityState={{selected}}
                            onPress={() => onRouteTransportFilterChange(tabValue)}
                            style={[styles.journeyTab, selected && {backgroundColor: colors.bg}]}
                          >
                            <Text style={[styles.journeyTabLabel, {color: selected ? colors.ink : colors.muted}]}>
                              {tabValue === 'combi' ? 'Combis' : 'Camiones'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}

                {journeyOptions.length > 0 && !showOnlyFavorites ? (
                  <View style={[styles.journeyTabs, {backgroundColor: colors.surface}]} accessibilityRole="tablist">
                    {(['direct', 'transfer'] as const).map(tabValue => {
                      const selected = journeyTab === tabValue;
                      const count = countJourneyOptions(journeyOptions, tabValue);
                      return (
                        <Pressable
                          key={tabValue}
                          accessibilityRole="tab"
                          accessibilityState={{selected}}
                          onPress={() => onJourneyTabChange(tabValue)}
                          style={[styles.journeyTab, selected && {backgroundColor: colors.bg}]}
                        >
                          <Text style={[styles.journeyTabLabel, {color: selected ? colors.ink : colors.muted}]}>
                            {tabValue === 'direct' ? 'Directos' : 'Transbordos'}
                          </Text>
                          <View style={[styles.journeyTabCount, {backgroundColor: colors.surface}]}>
                            <Text style={[styles.journeyTabCountText, {color: colors.ink}]}>{count}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                <FlatList
                  data={drawerItems}
                  renderItem={renderDrawerItem}
                  keyExtractor={item => item.listKey || `${item.kind}-${item.id}`}
                  style={styles.drawerList}
                  contentContainerStyle={styles.drawerListContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  initialNumToRender={10}
                  maxToRenderPerBatch={8}
                  updateCellsBatchingPeriod={40}
                  windowSize={5}
                  removeClippedSubviews={Platform.OS === 'android'}
                  ListEmptyComponent={
                    <Text style={[styles.empty, {color: colors.muted}]}>
                      {showOnlyFavorites
                        ? 'No tienes rutas favoritas guardadas.'
                        : showCatalogControls && routeSearchQuery.trim()
                          ? 'No encontramos rutas con ese nombre.'
                          : journeyOptions.length > 0 && journeyTab === 'transfer'
                            ? 'No necesitas un transbordo que reduzca significativamente la caminata.'
                            : 'No encontramos rutas. Prueba con otra búsqueda.'}
                    </Text>
                  }
                />
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  drawerContainer: {flex: 1, flexDirection: 'row'},
  backdrop: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.55)'},
  leftDrawer: {
    width: '80%',
    maxWidth: 300,
    alignSelf: 'stretch',
    zIndex: 1,
    borderRightWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: {width: 4, height: 0},
    elevation: 16,
  },
  drawerHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  brandMark: {width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  brandCopy: {flex: 1},
  brandTitle: {fontSize: 16, fontWeight: '700'},
  brandSubtitle: {fontSize: 9, marginTop: 1},
  closeBtn: {width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8},
  drawerActions: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
  },
  drawerActionRow: {
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  drawerActionAccount: {flex: 1, flexDirection: 'row', paddingHorizontal: 12},
  drawerActionFavorites: {width: 44, paddingHorizontal: 0},
  drawerContent: {flex: 1, minHeight: 0},
  loadingState: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60},
  loadingTitle: {fontSize: 14, marginTop: 16, fontWeight: '600', textAlign: 'center'},
  loadingSubtitle: {fontSize: 11, marginTop: 6, textAlign: 'center', paddingHorizontal: 20},
  routeSearchRow: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 8,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeSearchInput: {flex: 1, fontSize: 14, paddingVertical: 8},
  journeyTabs: {flexDirection: 'row', gap: 4, marginHorizontal: 14, marginBottom: 10, padding: 4, borderRadius: 12},
  journeyTab: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 8,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  journeyTabLabel: {fontSize: 12, fontWeight: '700'},
  journeyTabCount: {minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  journeyTabCountText: {fontSize: 10, fontWeight: '800'},
  drawerList: {flex: 1, marginTop: 4},
  drawerListContent: {paddingHorizontal: 12, paddingBottom: 24},
  routeRow: {minHeight: 68, borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 11},
  routeNumberCircle: {width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center'},
  routeNumberText: {color: '#25271F', fontSize: 16, fontWeight: '800'},
  routeCopy: {flex: 1},
  routeName: {fontSize: 14, fontWeight: '700'},
  routeDetail: {fontSize: 12, marginTop: 3},
  routeTimeTag: {fontSize: 12, fontWeight: '600'},
  routeTrailing: {alignItems: 'flex-end', justifyContent: 'center'},
  routeFare: {fontSize: 11, marginTop: 2},
  empty: {padding: 20, textAlign: 'center', fontSize: 13, lineHeight: 19},
});