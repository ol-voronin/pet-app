import type { GeocodeResult, PlaceListItem } from '@pet-app/shared';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextInput,
} from 'react-native';
import { NetworkError } from '@/shared/api/http';
import { Button, Card, Chip, Icon, Input, Segmented, Text, useTheme } from '@/shared/ui';
import type { PlaceFilters } from '../api';
import { useDebounced, useNearbyPlaces } from '../hooks';
import { categoryIcon, categoryPluralKey } from '../labels';
import { useUserLocation } from '../location';
import {
  DEFAULT_CENTER,
  DEFAULT_RADIUS_KM,
  FILTER_CATEGORIES,
  RADIUS_OPTIONS_KM,
  widerRadius,
  type FilterCategory,
  type RadiusKm,
} from '../logic';
import { useRecentSearches } from '../recent';
import { PlaceRow } from './PlaceRow';
import { PlaceSheet } from './PlaceSheet';
import { SearchSuggestions } from './SearchSuggestions';

/**
 * The map tab without a native map (Expo Go, or a build without tiles yet): search, filters and a
 * list of places by distance. The native map will sit on top of the same data (ADR-0005).
 */
export function PlacesScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const settledQuery = useDebounced(query, 400);
  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [open247, setOpen247] = useState(false);
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(DEFAULT_RADIUS_KM);
  const [address, setAddress] = useState<GeocodeResult | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);

  const location = useUserLocation();
  const recent = useRecentSearches();
  const loadRecent = recent.load;
  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  // An address the person picked wins over their own position, which wins over the city centre.
  const center = address ?? location.point ?? DEFAULT_CENTER;
  const filters = useMemo<PlaceFilters>(() => ({ categories, open247 }), [categories, open247]);
  const nearby = useNearbyPlaces(center, radiusKm * 1000, filters);

  const searching = focused || query.trim().length > 0;
  const closeSearch = () => {
    setQuery('');
    input.current?.blur();
  };

  const toggleCategory = (category: FilterCategory) => {
    setCategories((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category],
    );
  };

  const header = (
    <View style={{ gap: spacing.lg }}>
      <View>
        <Input
          ref={input}
          value={query}
          onChangeText={setQuery}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          placeholder={t('places.searchPlaceholder')}
          accessibilityLabel={t('places.searchLabel')}
          returnKeyType="search"
          autoCorrect={false}
          style={{ paddingRight: spacing.xxl + spacing.lg }}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={closeSearch}
            accessibilityRole="button"
            accessibilityLabel={t('places.clearSearch')}
            hitSlop={spacing.md}
            style={[styles.clear, { right: spacing.md }]}
          >
            <Icon name="clear" color="textMuted" />
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        <SearchSuggestions
          query={query}
          settledQuery={settledQuery}
          near={center}
          recent={recent.recent ?? []}
          onRecent={setQuery}
          onClearRecent={recent.clear}
          onCategory={(category) => {
            recent.add(query);
            setCategories([category]);
            closeSearch();
          }}
          onPlace={(place: PlaceListItem) => {
            recent.add(place.name ?? query);
            setPlaceId(place.id);
          }}
          onAddress={(found) => {
            recent.add(query);
            setAddress(found);
            closeSearch();
          }}
        />
      ) : (
        <>
          {/* One scrolling line: seven pills in a wrap would push the list off the first screen. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel={t('places.filter.categories')}
            // Bleeds to the screen edges, so pills visibly continue past them.
            style={{ marginHorizontal: -spacing.xl }}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}
          >
            {FILTER_CATEGORIES.map((category) => (
              <Chip
                key={category}
                icon={categoryIcon[category]}
                label={t(categoryPluralKey[category])}
                selected={categories.includes(category)}
                onPress={() => {
                  toggleCategory(category);
                }}
              />
            ))}
            <Chip
              icon="clock"
              label={t('places.filter.open247')}
              selected={open247}
              onPress={() => {
                setOpen247((value) => !value);
              }}
            />
          </ScrollView>

          <Segmented
            label={t('places.filter.radius')}
            options={RADIUS_OPTIONS_KM.map((km) => ({
              value: String(km),
              label: t('places.filter.radiusKm', { km }),
            }))}
            value={String(radiusKm)}
            onChange={(value) => {
              const km = RADIUS_OPTIONS_KM.find((option) => String(option) === value);
              if (km) setRadiusKm(km);
            }}
          />

          <NearLine
            address={address}
            onResetAddress={() => {
              setAddress(null);
            }}
          />

          {nearby.data && nearby.data.length > 0 ? (
            <Text variant="label" color="textMuted" accessibilityRole="header">
              {t('places.list.count', { count: nearby.data.length })}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );

  const next = widerRadius(radiusKm);
  const empty = searching ? undefined : nearby.isPending ? (
    <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
  ) : nearby.isError ? (
    <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
      <Text color="textMuted">
        {nearby.error instanceof NetworkError ? t('places.list.offline') : t('places.list.error')}
      </Text>
      <Button
        variant="secondary"
        title={t('common.retry')}
        onPress={() => {
          void nearby.refetch();
        }}
      />
    </View>
  ) : (
    <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
      <Text color="textMuted">{t('places.list.empty')}</Text>
      {next ? (
        <Button
          variant="secondary"
          title={t('places.list.widen', { km: next })}
          onPress={() => {
            setRadiusKm(next);
          }}
        />
      ) : (
        <Text variant="bodySmall" color="textMuted">
          {t('places.list.widest')}
        </Text>
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={searching ? [] : (nearby.data ?? [])}
        keyExtractor={(place) => place.id}
        renderItem={({ item }) => (
          <PlaceRow
            place={item}
            onPress={() => {
              setPlaceId(item.id);
            }}
          />
        )}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
        )}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: spacing.lg }}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <View style={{ gap: spacing.xs, marginTop: spacing.xl }}>
            <Text variant="caption" color="textMuted">
              {t('places.listNote')}
            </Text>
            <Text variant="caption" color="textMuted">
              {t('places.attribution')}
            </Text>
          </View>
        }
        // A tap on a suggestion must not be eaten by the keyboard closing.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // The tab has a header, so the top safe area is already taken care of.
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.lg }}
        initialNumToRender={12}
        windowSize={7}
      />
      <PlaceSheet
        placeId={placeId}
        onClose={() => {
          setPlaceId(null);
        }}
      />
    </View>
  );
}

/** Where the list is centred, and the one-tap way to centre it on the person. */
function NearLine({
  address,
  onResetAddress,
}: {
  address: GeocodeResult | null;
  onResetAddress: () => void;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const status = useUserLocation((s) => s.status);
  const located = useUserLocation((s) => s.point !== null);
  const locate = useUserLocation((s) => s.locate);

  if (address) {
    return (
      <Card style={{ gap: spacing.sm }}>
        <Text>{t('places.near.address', { address: address.label })}</Text>
        <Button variant="ghost" title={t('places.near.reset')} onPress={onResetAddress} />
      </Card>
    );
  }
  if (located) {
    return (
      <View style={[styles.line, { gap: spacing.sm }]}>
        <Icon name="locate" size={20} color="textMuted" />
        <Text color="textMuted" style={styles.flex}>
          {t('places.near.me')}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={[styles.line, { gap: spacing.sm }]}>
        <Icon name="map" size={20} color="textMuted" />
        <Text color="textMuted" style={styles.flex}>
          {t('places.near.default')}
        </Text>
      </View>
      <Button
        variant="secondary"
        title={status === 'asking' ? t('places.near.locating') : t('places.near.locate')}
        loading={status === 'asking'}
        onPress={() => {
          void locate();
        }}
      />
      {status === 'denied' || status === 'unavailable' ? (
        <Text variant="bodySmall" color="textMuted">
          {status === 'denied' ? t('places.near.denied') : t('places.near.unavailable')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center' },
  clear: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  separator: { height: StyleSheet.hairlineWidth },
});
