import type { Place } from '@pet-app/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button, Icon, Text, useTheme } from '@/shared/ui';
import { useDeletePlace, usePlace } from '../hooks';
import { categoryKey } from '../labels';
import { formatPhone, ownStatusKey, routeUrl, telUrl } from '../logic';

/**
 * The place card inside the map's bottom panel (design canvas «6. Карта»): what and where,
 * when it works, and the two actions — directions and a call.
 */
export function PlaceCard({
  placeId,
  distance,
  onClose,
}: {
  placeId: string;
  /** «1,2 км» from the person, when their position is known. */
  distance: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const place = usePlace(placeId);

  const close = (
    <Pressable
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}
      hitSlop={spacing.sm}
      style={[styles.close, { backgroundColor: colors.surfaceMuted }]}
    >
      <Icon name="close" size={20} />
    </Pressable>
  );

  if (place.data) {
    return <Card place={place.data} distance={distance} close={close} onDeleted={onClose} />;
  }
  return (
    <View style={[styles.row, { gap: spacing.md, minHeight: 96 }]}>
      <View style={[styles.body, styles.center]}>
        {place.isError ? (
          <>
            <Text color="textMuted">{t('places.card.error')}</Text>
            <Button
              variant="ghost"
              title={t('common.retry')}
              onPress={() => {
                void place.refetch();
              }}
            />
          </>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
      {close}
    </View>
  );
}

function Card({
  place,
  distance,
  close,
  onDeleted,
}: {
  place: Place;
  distance: string | null;
  close: React.ReactNode;
  onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { spacing } = useTheme();
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const remove = useDeletePlace();

  const open = (url: string) => {
    setFailed(false);
    Linking.openURL(url).catch(() => {
      // No dialer on a tablet, no maps app on an emulator.
      setFailed(true);
    });
  };

  const category = t(categoryKey[place.category]);
  const where = [place.name ? category : null, place.address, distance].filter(Boolean).join(' · ');
  const hours = place.open247 ? t('places.card.open247') : place.openingHours;
  const checked = place.verifiedAt
    ? t('places.card.verifiedShort', {
        date: new Intl.DateTimeFormat(i18n.language, {
          month: '2-digit',
          year: 'numeric',
          timeZone: 'Europe/Kyiv',
        }).format(new Date(place.verifiedAt)),
      })
    : null;
  const when = [hours, checked].filter(Boolean).join(' · ');
  const notes = [
    place.emergency ? t('places.card.emergency') : null,
    place.fenced ? t('places.card.fenced') : null,
  ].filter(Boolean);
  const phone = place.phones[0];

  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <View style={styles.body}>
          <Text variant="heading" accessibilityRole="header">
            {place.name ?? category}
          </Text>
          {where ? (
            <Text variant="bodySmall" color="textMuted">
              {where}
            </Text>
          ) : null}
          {when ? (
            <Text variant="bodySmall" color="textMuted">
              {when}
            </Text>
          ) : null}
          {notes.length > 0 ? (
            <Text variant="bodySmall" color="textMuted">
              {notes.join(' · ')}
            </Text>
          ) : null}
        </View>
        {close}
      </View>

      {/* Side by side as in the design; under each other once a large font no longer fits two. */}
      <View style={[styles.actions, { gap: spacing.sm }]}>
        <View style={styles.action}>
          <Button
            title={t('places.card.route')}
            fullWidth
            onPress={() => {
              open(routeUrl(Platform.OS, place));
            }}
          />
        </View>
        {phone ? (
          <View style={styles.action}>
            <Button
              variant="secondary"
              title={t('places.card.call')}
              accessibilityHint={formatPhone(phone)}
              fullWidth
              onPress={() => {
                open(telUrl(phone));
              }}
            />
          </View>
        ) : null}
      </View>
      {place.phones.length > 1 ? (
        <Text variant="bodySmall" color="textMuted">
          {place.phones.slice(1).map(formatPhone).join(', ')}
        </Text>
      ) : null}
      {place.website ? (
        <Button
          variant="ghost"
          title={t('places.card.website')}
          onPress={() => {
            if (place.website) open(place.website);
          }}
        />
      ) : null}
      {failed ? (
        <Text variant="bodySmall" color="danger">
          {t('places.card.cannotOpen')}
        </Text>
      ) : null}

      {place.mine ? (
        <View style={{ gap: spacing.xs }}>
          <Text variant="bodySmall" color="textMuted">
            {t(ownStatusKey(place))}
          </Text>
          {place.canDelete ? (
            // Two taps: the first one only asks.
            <Button
              variant="danger"
              title={confirming ? t('places.own.deleteConfirm') : t('places.own.delete')}
              loading={remove.isPending}
              onPress={() => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                remove.mutate(place.id, { onSuccess: onDeleted });
              }}
            />
          ) : null}
          {remove.isError ? (
            <Text variant="bodySmall" color="danger">
              {t('places.own.deleteError')}
            </Text>
          ) : null}
        </View>
      ) : place.verifiedAt ? null : (
        <Text variant="caption" color="textMuted">
          {t('places.card.notVerified')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  body: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  action: { flexGrow: 1, flexBasis: 140 },
});
