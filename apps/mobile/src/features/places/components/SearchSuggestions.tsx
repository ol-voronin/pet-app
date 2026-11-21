import type { GeocodeResult, PlaceListItem } from '@pet-app/shared';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { NetworkError } from '@/shared/api/http';
import { Button, Card, IconPlate, Text, useTheme, type IconName } from '@/shared/ui';
import type { Point } from '../api';
import { useGeocode, useSearchPlaces } from '../hooks';
import { categoryIcon, categoryPluralKey, categoryWordsKey } from '../labels';
import {
  canSearchAddress,
  canSearchPlaces,
  FILTER_CATEGORIES,
  matchCategories,
  type FilterCategory,
} from '../logic';
import { PlaceRow } from './PlaceRow';

const NO_FILTERS = { categories: [], open247: false } as const;

export interface SearchSuggestionsProps {
  /** What is in the search box right now (categories match as the person types). */
  query: string;
  /** The same, after a pause in typing: what the server is asked. */
  settledQuery: string;
  near: Point;
  recent: readonly string[];
  onCategory: (category: FilterCategory) => void;
  onPlace: (place: PlaceListItem) => void;
  onAddress: (address: GeocodeResult) => void;
  onRecent: (query: string) => void;
  onClearRecent: () => void;
}

/** What the search shows under the box: categories, places, addresses — or recent searches. */
export function SearchSuggestions(props: SearchSuggestionsProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { query, settledQuery, near } = props;
  const places = useSearchPlaces(settledQuery, near, NO_FILTERS);
  const addresses = useGeocode(settledQuery, near);

  const words = Object.fromEntries(
    FILTER_CATEGORIES.map((c) => [c, t(categoryWordsKey[c]).split(' ')]),
  ) as Record<FilterCategory, string[]>;
  const categories = matchCategories(query, words);

  const offline = places.error instanceof NetworkError;
  const typing = query.trim() !== settledQuery.trim();
  const waiting =
    typing ||
    (canSearchPlaces(settledQuery) && places.isPending) ||
    (canSearchAddress(settledQuery) && addresses.isPending);
  const foundPlaces = places.data ?? [];
  const foundAddresses = addresses.data ?? [];
  const nothing =
    !waiting &&
    !offline &&
    canSearchPlaces(query) &&
    categories.length === 0 &&
    foundPlaces.length === 0 &&
    foundAddresses.length === 0;

  // Nothing typed yet, or no network: recent searches are all there is to show.
  if (!canSearchPlaces(query) || offline) {
    return (
      <View style={{ gap: spacing.md }}>
        {offline ? <Text color="textMuted">{t('places.suggest.offline')}</Text> : null}
        {props.recent.length > 0 ? (
          <Section
            title={t('places.suggest.recent')}
            action={{ title: t('places.suggest.clearRecent'), onPress: props.onClearRecent }}
          >
            {props.recent.map((item) => (
              <SuggestionRow
                key={item}
                icon="recent"
                title={item}
                onPress={() => {
                  props.onRecent(item);
                }}
              />
            ))}
          </Section>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.lg }}>
      {categories.length > 0 ? (
        <Section title={t('places.suggest.categories')}>
          {categories.map((category) => (
            <SuggestionRow
              key={category}
              icon={categoryIcon[category]}
              title={t('places.suggest.showAll', { category: t(categoryPluralKey[category]) })}
              onPress={() => {
                props.onCategory(category);
              }}
            />
          ))}
        </Section>
      ) : null}

      {foundPlaces.length > 0 ? (
        <Section title={t('places.suggest.places')}>
          {foundPlaces.map((place) => (
            <PlaceRow
              key={place.id}
              inset="card"
              place={place}
              onPress={() => {
                props.onPlace(place);
              }}
            />
          ))}
        </Section>
      ) : null}

      {foundAddresses.length > 0 ? (
        <Section title={t('places.suggest.addresses')}>
          {foundAddresses.map((address) => (
            <SuggestionRow
              key={`${address.label}|${address.detail ?? ''}`}
              icon="address"
              title={address.label}
              {...(address.detail ? { subtitle: address.detail } : {})}
              onPress={() => {
                props.onAddress(address);
              }}
            />
          ))}
        </Section>
      ) : null}

      {waiting ? <ActivityIndicator color={colors.accent} /> : null}
      {nothing ? <Text color="textMuted">{t('places.suggest.nothing')}</Text> : null}
      {!waiting && addresses.isError && canSearchAddress(settledQuery) ? (
        <Text variant="caption" color="textMuted">
          {t('places.suggest.addressUnavailable')}
        </Text>
      ) : null}
    </View>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { title: string; onPress: () => void };
  children: React.ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.sectionHead}>
        <Text variant="section" accessibilityRole="header" style={styles.body}>
          {title}
        </Text>
        {action ? <Button variant="ghost" title={action.title} onPress={action.onPress} /> : null}
      </View>
      {/* Rows bring their own padding. */}
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

function SuggestionRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const { colors, spacing, sizes } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: sizes.listRow,
          gap: spacing.md,
          paddingHorizontal: spacing.md + spacing.xxs,
          paddingVertical: spacing.sm,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <IconPlate name={icon} />
      <View style={styles.body}>
        <Text variant="rowTitle" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center' },
  card: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1 },
});
