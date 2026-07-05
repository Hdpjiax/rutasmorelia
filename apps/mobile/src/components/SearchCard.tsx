import {
  ArrowsDownUp,
  Heart,
  List,
  MagnifyingGlass,
  MapPin,
  NavigationArrow,
} from 'phosphor-react-native';
import {useEffect, useRef} from 'react';
import {ActivityIndicator, Animated, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import type {AppColorScheme} from '../lib/color-scheme';
import type {Suggestion} from '../types/transit';
import {dark, light} from '../theme';

const ORIGIN_COLOR = '#2563eb';
const DESTINATION_COLOR = '#ef4444';

type ThemeColors = typeof light;

type SearchCardProps = {
  colorScheme: AppColorScheme;
  top: number;
  originLabel: string;
  destinationLabel: string;
  origin: {latitude: number; longitude: number} | null;
  destination: {latitude: number; longitude: number} | null;
  isOriginFavorited: boolean;
  isDestinationFavorited: boolean;
  displayedSuggestions: Suggestion[];
  activeInput: 'origin' | 'destination' | null;
  browsingFavorites: boolean;
  loading: boolean;
  originInputRef: React.RefObject<TextInput | null>;
  destinationInputRef: React.RefObject<TextInput | null>;
  onOpenMenu: () => void;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onOriginFocus: () => void;
  onDestinationFocus: () => void;
  onLocate: () => void;
  onSwap: () => void;
  onToggleOriginFavorite: () => void;
  onToggleDestinationFavorite: () => void;
  onSelectSuggestion: (suggestion: Suggestion) => void;
  onSearch: () => void;
};

export function SearchCard({
  colorScheme,
  top,
  originLabel,
  destinationLabel,
  origin,
  destination,
  isOriginFavorited,
  isDestinationFavorited,
  displayedSuggestions,
  activeInput,
  browsingFavorites,
  loading,
  originInputRef,
  destinationInputRef,
  onOpenMenu,
  onOriginChange,
  onDestinationChange,
  onOriginFocus,
  onDestinationFocus,
  onLocate,
  onSwap,
  onToggleOriginFavorite,
  onToggleDestinationFavorite,
  onSelectSuggestion,
  onSearch,
}: SearchCardProps) {
  const colors: ThemeColors = colorScheme === 'dark' ? dark : light;
  const suggestionsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shouldShow = displayedSuggestions.length > 0 && Boolean(activeInput);
    Animated.spring(suggestionsAnim, {
      toValue: shouldShow ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 80,
    }).start();
  }, [activeInput, displayedSuggestions.length, suggestionsAnim]);

  const suggestionsStyle = {
    opacity: suggestionsAnim,
    transform: [
      {
        translateY: suggestionsAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 0],
        }),
      },
    ],
  };

  return (
    <View style={[styles.floatingSearchCard, {backgroundColor: colors.surface, borderColor: colors.line, top}]}>
      <Pressable
        onPress={onOpenMenu}
        style={[styles.hamburgerBtn, {backgroundColor: colors.surface, borderColor: colors.line}]}
      >
        <List size={22} color={colors.ink} />
      </Pressable>

      <View style={{flex: 1}}>
        <View style={styles.searchFields}>
          <View
            style={[
              styles.compactInputRow,
              {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.line,
                backgroundColor: activeInput === 'origin' ? `${ORIGIN_COLOR}18` : 'transparent',
                borderRadius: 10,
                borderWidth: activeInput === 'origin' ? 1.5 : 0,
                borderColor: activeInput === 'origin' ? ORIGIN_COLOR : 'transparent',
              },
            ]}
          >
            <MapPin size={16} color={ORIGIN_COLOR} weight="fill" />
            <TextInput
              ref={originInputRef}
              accessibilityLabel="Origen"
              style={[styles.compactInput, {color: colors.ink}]}
              value={originLabel}
              onChangeText={onOriginChange}
              onFocus={onOriginFocus}
              placeholder="Origen"
              placeholderTextColor={colors.muted}
            />
            {origin ? (
              <Pressable onPress={onToggleOriginFavorite} style={{padding: 4}}>
                <Heart
                  size={16}
                  color={isOriginFavorited ? ORIGIN_COLOR : colors.muted}
                  weight={isOriginFavorited ? 'fill' : 'regular'}
                />
              </Pressable>
            ) : null}
            <Pressable onPress={onLocate} style={{padding: 4}}>
              <NavigationArrow size={16} color={ORIGIN_COLOR} weight="fill" />
            </Pressable>
          </View>
          <View
            style={[
              styles.compactInputRow,
              {
                backgroundColor: activeInput === 'destination' ? `${DESTINATION_COLOR}18` : 'transparent',
                borderRadius: 10,
                borderWidth: activeInput === 'destination' ? 1.5 : 0,
                borderColor: activeInput === 'destination' ? DESTINATION_COLOR : 'transparent',
              },
            ]}
          >
            <MapPin size={16} color={DESTINATION_COLOR} weight="fill" />
            <TextInput
              ref={destinationInputRef}
              accessibilityLabel="Destino"
              style={[styles.compactInput, {color: colors.ink}]}
              value={destinationLabel}
              onChangeText={onDestinationChange}
              onFocus={onDestinationFocus}
              placeholder="Busca un lugar o colonia"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              onSubmitEditing={onSearch}
            />
            {destination ? (
              <Pressable onPress={onToggleDestinationFavorite} style={{padding: 4}}>
                <Heart
                  size={16}
                  color={isDestinationFavorited ? DESTINATION_COLOR : colors.muted}
                  weight={isDestinationFavorited ? 'fill' : 'regular'}
                />
              </Pressable>
            ) : null}
            <Pressable onPress={onSwap} style={{padding: 4}}>
              <ArrowsDownUp size={16} color={colors.primary} weight="bold" />
            </Pressable>
          </View>
        </View>

        {displayedSuggestions.length > 0 && activeInput ? (
          <Animated.View
            style={[
              styles.suggestions,
              {borderColor: colors.line, backgroundColor: colors.surface},
              suggestionsStyle,
            ]}
          >
            {browsingFavorites && displayedSuggestions.length > 0 ? (
              <Text style={[styles.suggestionsHeading, {color: colors.muted}]}>LUGARES FAVORITOS</Text>
            ) : null}
            {displayedSuggestions.map(suggestion => {
              const isFav = suggestion.subtitle?.toLowerCase().includes('favorit');
              const iconColor = activeInput === 'origin' ? ORIGIN_COLOR : DESTINATION_COLOR;
              return (
                <Pressable
                  key={`${suggestion.entity_type}-${suggestion.entity_id}-${suggestion.label}`}
                  onPress={() => onSelectSuggestion(suggestion)}
                  style={[styles.suggestion, {borderBottomColor: colors.line}]}
                >
                  {isFav ? (
                    <Heart size={17} color={iconColor} weight="fill" />
                  ) : (
                    <MapPin size={17} color={iconColor} />
                  )}
                  <View style={styles.suggestionCopy}>
                    <Text numberOfLines={1} style={[styles.suggestionTitle, {color: colors.ink}]}>
                      {isFav ? `★ ${suggestion.label}` : suggestion.label}
                    </Text>
                    <Text numberOfLines={1} style={[styles.suggestionSubtitle, {color: colors.muted}]}>
                      {suggestion.subtitle || 'Morelia'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </Animated.View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buscar ruta"
        accessibilityState={{busy: loading, disabled: loading}}
        disabled={loading}
        onPress={onSearch}
        style={[styles.searchSubmitBtn, {backgroundColor: colors.primary}, loading && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <MagnifyingGlass size={22} color="#FFFFFF" weight="bold" />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingSearchCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 5,
  },
  searchFields: {flex: 1, gap: 4},
  compactInputRow: {height: 38, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 8},
  compactInput: {flex: 1, height: 36, fontSize: 14, padding: 0},
  hamburgerBtn: {
    width: 42,
    height: 76,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSubmitBtn: {width: 44, height: 76, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  disabled: {opacity: 0.55},
  suggestions: {
    position: 'absolute',
    top: 86,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 8,
    zIndex: 100,
  },
  suggestionsHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  suggestion: {
    minHeight: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  suggestionCopy: {flex: 1},
  suggestionTitle: {fontSize: 13, fontWeight: '700'},
  suggestionSubtitle: {fontSize: 11, marginTop: 2},
});