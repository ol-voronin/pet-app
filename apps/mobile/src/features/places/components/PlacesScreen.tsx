import type { GeocodeResult, PlaceListItem } from '@pet-app/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NetworkError } from '@/shared/api/http';
import { Button, Card, Chip, floatingShadow, Icon, Text, useTheme } from '@/shared/ui';
import type { PlaceFilters, Point } from '../api';
import { useDebounced, useInBoxPlaces, useNearbyPlaces } from '../hooks';
import { categoryIcon, categoryPluralKey } from '../labels';
import { useUserLocation } from '../location';
import { DEFAULT_CENTER, FILTER_CATEGORIES, type FilterCategory } from '../logic';
import { MapView, type MapViewHandle } from '../map/MapView';
import { radiusForRegion, toPins, type MapEvent } from '../map/protocol';
import { useRecentSearches } from '../recent';
import { PlaceCard } from './PlaceCard';
import { PlaceRow, useDistanceLabel } from './PlaceRow';
import { SearchSuggestions } from './SearchSuggestions';

interface Region {
  bbox: [number, number, number, number];
  center: Point;
}

/** Distance from the person to a place, when the person's position is known. */
function distanceFrom(from: Point | null, to: Point): number | null {
  if (!from) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(to.lat - from.lat) / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(rad(to.lon - from.lon) / 2) ** 2;
  return 2 * 6_371_008 * Math.asin(Math.sqrt(h));
}

/**
 * The «Карта» tab (design canvas «6. Карта», «8. Пошук», «8а. Результати»): the map fills the
 * screen, search and filters float on top, the bottom panel holds the list or a place card.
 */
export function PlacesScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const map = useRef<MapViewHandle>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const distanceLabel = useDistanceLabel();

  const user = useUserLocation();
  const recent = useRecentSearches();
  const loadRecent = recent.load;
  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  // The map is built once around where the person is, if known, else Kharkiv centre.
  const [initial] = useState(() => user.point ?? DEFAULT_CENTER);
  const [mapKey, setMapKey] = useState(0);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [region, setRegion] = useState<Region | null>(null);
  const settledRegion = useDebounced(region, 350);

  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [open247, setOpen247] = useState(false);
  const filters = useMemo<PlaceFilters>(() => ({ categories, open247 }), [categories, open247]);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const settledQuery = useDebounced(query, 400);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const box = settledRegion
    ? {
        west: settledRegion.bbox[0],
        south: settledRegion.bbox[1],
        east: settledRegion.bbox[2],
        north: settledRegion.bbox[3],
      }
    : null;
  const center = settledRegion?.center ?? initial;
  const pins = useInBoxPlaces(box, filters);
  const nearby = useNearbyPlaces(
    center,
    settledRegion ? radiusForRegion(settledRegion.center, settledRegion.bbox) : 3000,
    filters,
  );
  const list = nearby.data ?? [];

  // Pins → map.
  useEffect(() => {
    if (pins.data) map.current?.send({ type: 'places', pins: toPins(pins.data.places) });
  }, [pins.data, mapKey]);

  // The person's dot → map.
  useEffect(() => {
    if (user.point) map.current?.send({ type: 'user', ...user.point });
  }, [user.point, mapKey]);

  // The selected place: a bigger pin with the distance under it.
  const selected = useMemo(
    () =>
      placeId
        ? (pins.data?.places.find((p) => p.id === placeId) ?? list.find((p) => p.id === placeId))
        : undefined,
    [placeId, pins.data, list],
  );
  const selectedDistance = selected ? distanceLabel(distanceFrom(user.point, selected)) : null;
  useEffect(() => {
    map.current?.send({
      type: 'select',
      pin: selected
        ? {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [selected.lon, selected.lat] },
            properties: {
              id: selected.id,
              category: selected.category,
              mine: selected.mine,
              ...(selectedDistance ? { label: selectedDistance } : {}),
            },
          }
        : null,
    });
  }, [selected, selectedDistance, mapKey]);

  const onEvent = useCallback((event: MapEvent) => {
    switch (event.type) {
      case 'ready':
        setMapState('ready');
        break;
      case 'region':
        setRegion({ bbox: event.bbox, center: event.center });
        break;
      case 'select':
        setPlaceId(event.id);
        break;
      case 'tapEmpty':
        setPlaceId(null);
        Keyboard.dismiss();
        break;
      case 'drag':
        setExpanded(false);
        break;
      case 'longPress':
        router.push({
          pathname: '/places/new',
          params: { lat: String(event.lat), lon: String(event.lon) },
        });
        break;
      case 'error':
        if (event.fatal) setMapState('failed');
        break;
    }
  }, []);

  // Panels cover the map; tell it, so «the middle» is the middle of what is visible.
  const [topHeight, setTopHeight] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  useEffect(() => {
    if (topHeight && panelHeight) {
      map.current?.send({ type: 'padding', top: topHeight, bottom: panelHeight });
    }
  }, [topHeight, panelHeight, mapKey]);

  const flyTo = (point: Point, zoom = 16) => {
    map.current?.send({ type: 'flyTo', lat: point.lat, lon: point.lon, zoom });
  };

  const closeSearch = () => {
    setSearching(false);
    setQuery('');
    input.current?.blur();
    Keyboard.dismiss();
  };

  const locateMe = async () => {
    await user.locate();
    const point = useUserLocation.getState().point;
    if (point) flyTo(point, 15);
  };

  const toggleCategory = (category: FilterCategory) => {
    setCategories((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category],
    );
  };

  const addOwnPlace = () => {
    const at = region?.center ?? initial;
    router.push({ pathname: '/places/new', params: { lat: String(at.lat), lon: String(at.lon) } });
  };

  const panelMax = Math.round(windowHeight * (expanded ? 0.62 : 0.34));

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <MapView
        key={mapKey}
        ref={map}
        initialCenter={initial}
        initialZoom={user.point ? 14 : 12.5}
        onEvent={onEvent}
      />

      {mapState === 'failed' ? (
        <View style={[styles.mapMessage, { top: topHeight + spacing.lg }]} pointerEvents="box-none">
          <Card style={[floatingShadow, { gap: spacing.sm, marginHorizontal: spacing.xl }]}>
            <Text>{t('places.map.failed')}</Text>
            <Button
              variant="secondary"
              title={t('common.retry')}
              onPress={() => {
                setMapState('loading');
                setMapKey((k) => k + 1);
              }}
            />
          </Card>
        </View>
      ) : null}

      {/* Search and filters over the map. */}
      <View
        style={[styles.top, { paddingTop: insets.top + spacing.sm, gap: spacing.sm }]}
        pointerEvents="box-none"
        onLayout={(e) => {
          setTopHeight(Math.round(e.nativeEvent.layout.height));
        }}
      >
        <Pressable
          onPress={() => {
            setSearching(true);
          }}
          accessibilityRole="search"
          accessibilityLabel={t('places.searchLabel')}
          style={[
            styles.searchPill,
            floatingShadow,
            {
              marginHorizontal: spacing.xl,
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.lg,
              gap: spacing.sm,
            },
          ]}
        >
          <Icon name="search" size={20} />
          <Text color="textMuted" numberOfLines={1} style={styles.flex}>
            {t('places.searchPlaceholder')}
          </Text>
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          accessibilityLabel={t('places.filter.categories')}
          contentContainerStyle={{
            gap: spacing.sm,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.sm,
          }}
        >
          {FILTER_CATEGORIES.map((category) => (
            <Chip
              key={category}
              floating
              icon={categoryIcon[category]}
              label={t(categoryPluralKey[category])}
              selected={categories.includes(category)}
              onPress={() => {
                toggleCategory(category);
              }}
            />
          ))}
          <Chip
            floating
            icon="clock"
            label={t('places.filter.open247')}
            selected={open247}
            onPress={() => {
              setOpen247((value) => !value);
            }}
          />
        </ScrollView>
      </View>

      {/* My location, just above the panel. */}
      <Pressable
        onPress={() => {
          void locateMe();
        }}
        accessibilityRole="button"
        accessibilityLabel={t('places.near.locate')}
        style={[
          styles.locate,
          floatingShadow,
          { bottom: panelHeight + spacing.md, right: spacing.lg, backgroundColor: colors.surface },
        ]}
      >
        {user.status === 'asking' ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Icon name="locate" size={22} />
        )}
      </Pressable>

      {/* Bottom panel: a place card or the list of what is around. */}
      <View
        style={[
          styles.panel,
          floatingShadow,
          {
            maxHeight: panelMax,
            backgroundColor: colors.background,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
          },
        ]}
        onLayout={(e) => {
          setPanelHeight(Math.round(e.nativeEvent.layout.height));
        }}
      >
        <Pressable
          onPress={() => {
            setExpanded((value) => !value);
          }}
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('places.sheet.collapse') : t('places.sheet.expand')}
          style={{ paddingTop: spacing.sm, paddingBottom: spacing.xs, alignItems: 'center' }}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </Pressable>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.lg,
            gap: spacing.md,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {placeId ? (
            <PlaceCard
              placeId={placeId}
              distance={selectedDistance}
              onClose={() => {
                setPlaceId(null);
              }}
            />
          ) : (
            <>
              <View style={[styles.listHead, { gap: spacing.sm }]}>
                <Text variant="heading" accessibilityRole="header" style={styles.flex}>
                  {nearby.isPending
                    ? t('places.sheet.loading')
                    : t('places.sheet.count', { count: list.length })}
                </Text>
                {list.length > 0 ? (
                  <Text variant="caption" color="textMuted">
                    {t('places.sheet.byDistance')}
                  </Text>
                ) : null}
              </View>
              {nearby.isError ? (
                <View style={{ gap: spacing.sm }}>
                  <Text color="textMuted">
                    {nearby.error instanceof NetworkError
                      ? t('places.list.offline')
                      : t('places.list.error')}
                  </Text>
                  <Button
                    variant="secondary"
                    title={t('common.retry')}
                    onPress={() => {
                      void nearby.refetch();
                    }}
                  />
                </View>
              ) : list.length > 0 ? (
                <Card style={styles.listCard}>
                  {list.map((place: PlaceListItem, index) => (
                    <PlaceRow
                      key={place.id}
                      place={place}
                      last={index === list.length - 1}
                      onPress={() => {
                        setPlaceId(place.id);
                        flyTo(place, 16);
                      }}
                    />
                  ))}
                </Card>
              ) : nearby.isPending ? null : (
                <Text color="textMuted">{t('places.sheet.empty')}</Text>
              )}
              <Button variant="ghost" title={t('places.new.open')} onPress={addOwnPlace} />
              <Text variant="caption" color="textMuted">
                {t('places.sheet.longPressHint')}
              </Text>
            </>
          )}
          <Text variant="caption" color="textMuted">
            {t('places.attribution')}
          </Text>
        </ScrollView>
      </View>

      {/* Search: covers the map while the person types (design canvas «8. Пошук»). */}
      {searching ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.background, paddingTop: insets.top + spacing.sm },
          ]}
        >
          <View style={[styles.searchRow, { paddingHorizontal: spacing.xl, gap: spacing.sm }]}>
            <View
              style={[
                styles.searchField,
                {
                  borderColor: colors.text,
                  backgroundColor: colors.surface,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  gap: spacing.sm,
                },
              ]}
            >
              <Icon name="search" size={20} />
              <TextInput
                ref={input}
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder={t('places.searchPlaceholder')}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={t('places.searchLabel')}
                returnKeyType="search"
                autoCorrect={false}
                style={[styles.flex, styles.searchInput, { color: colors.text }]}
              />
              {query.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setQuery('');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('places.clearSearch')}
                  hitSlop={spacing.sm}
                >
                  <Icon name="clear" color="textMuted" />
                </Pressable>
              ) : null}
            </View>
            <Button variant="ghost" title={t('common.cancel')} onPress={closeSearch} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{
              padding: spacing.xl,
              paddingBottom: insets.bottom + spacing.xxl,
            }}
          >
            <SearchSuggestions
              query={query}
              settledQuery={settledQuery}
              near={region?.center ?? initial}
              recent={recent.recent ?? []}
              onRecent={setQuery}
              onClearRecent={recent.clear}
              onCategory={(category) => {
                recent.add(query);
                setCategories([category]);
                setPlaceId(null);
                closeSearch();
              }}
              onPlace={(place) => {
                recent.add(place.name ?? query);
                closeSearch();
                setPlaceId(place.id);
                flyTo(place, 16);
              }}
              onAddress={(found: GeocodeResult) => {
                recent.add(query);
                closeSearch();
                setPlaceId(null);
                flyTo(found, 16);
              }}
            />
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  top: { position: 'absolute', left: 0, right: 0, top: 0 },
  searchPill: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchField: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
  },
  // minWidth 0: a text field otherwise refuses to shrink and pushes «Скасувати» off the row.
  searchInput: { fontSize: 16, paddingVertical: 12, minWidth: 0 },
  locate: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  listHead: { flexDirection: 'row', alignItems: 'baseline' },
  listCard: { padding: 0, overflow: 'hidden' },
  mapMessage: { position: 'absolute', left: 0, right: 0 },
});
