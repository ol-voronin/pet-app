import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/shared/ui';

/** Events arrive in V2; the tab is a "coming soon" stub so users see what is planned. */
export default function EventsScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('tabs.events')} subtitle={t('events.comingSoon')} />;
}
