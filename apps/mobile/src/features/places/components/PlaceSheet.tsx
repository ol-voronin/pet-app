import type { Place } from '@pet-app/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Sheet, Text, useTheme, type IconName } from '@/shared/ui';
import { useDeletePlace, usePlace } from '../hooks';
import { categoryIcon, categoryKey } from '../labels';
import { formatPhone, ownStatusKey, routeUrl, telUrl } from '../logic';

/** The place card: what it is, where, when it works, and the two actions — call and directions. */
export function PlaceSheet({ placeId, onClose }: { placeId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const place = usePlace(placeId);
  return (
    <Sheet visible={placeId !== null} onClose={onClose} closeLabel={t('common.close')}>
      {place.data ? (
        <PlaceCard place={place.data} onDeleted={onClose} />
      ) : place.isError ? (
        <View style={styles.center}>
          <Text color="textMuted">{t('places.card.error')}</Text>
          <Button
            variant="ghost"
            title={t('common.retry')}
            onPress={() => {
              void place.refetch();
            }}
          />
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
    </Sheet>
  );
}

function PlaceCard({ place, onDeleted }: { place: Place; onDeleted: () => void }) {
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

  const address = [place.address, place.city].filter(Boolean).join(', ');
  const facts: { icon: IconName; text: string }[] = [];
  if (address) facts.push({ icon: 'address', text: address });
  if (place.open247) facts.push({ icon: 'clock', text: t('places.card.open247') });
  else if (place.openingHours)
    facts.push({ icon: 'clock', text: `${t('places.card.hours')}: ${place.openingHours}` });
  if (place.emergency) facts.push({ icon: 'clinic', text: t('places.card.emergency') });
  if (place.fenced) facts.push({ icon: 'dogPark', text: t('places.card.fenced') });

  return (
    // Scrolls: with a large system font the card is taller than the screen.
    <ScrollView style={styles.scroll} contentContainerStyle={{ gap: spacing.lg }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <Icon name={categoryIcon[place.category]} size={28} />
        <View style={styles.body}>
          <Text variant="heading" accessibilityRole="header">
            {place.name ?? t(categoryKey[place.category])}
          </Text>
          {place.name ? (
            <Text variant="bodySmall" color="textMuted">
              {t(categoryKey[place.category])}
            </Text>
          ) : null}
        </View>
      </View>

      {facts.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {facts.map((fact) => (
            <View key={fact.text} style={[styles.row, { gap: spacing.md }]}>
              <Icon name={fact.icon} size={20} color="textMuted" />
              <Text style={styles.body}>{fact.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Button
          title={t('places.card.route')}
          fullWidth
          onPress={() => {
            open(routeUrl(Platform.OS, place));
          }}
        />
        {place.phones.map((phone) => (
          <Button
            key={phone}
            variant="secondary"
            fullWidth
            title={`${t('places.card.call')} ${formatPhone(phone)}`}
            onPress={() => {
              open(telUrl(phone));
            }}
          />
        ))}
        {place.phones.length === 0 ? (
          <Text variant="bodySmall" color="textMuted">
            {t('places.card.noContacts')}
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
      </View>

      {place.mine ? (
        <View style={{ gap: spacing.sm }}>
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
      ) : null}

      {place.source === 'user' ? null : (
        <Text variant="caption" color="textMuted">
          {place.verifiedAt
            ? t('places.card.verified', {
                date: new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: 'medium',
                  timeZone: 'Europe/Kyiv',
                }).format(new Date(place.verifiedAt)),
              })
            : t('places.card.notVerified')}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', minHeight: 160 },
  scroll: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  body: { flex: 1 },
});
