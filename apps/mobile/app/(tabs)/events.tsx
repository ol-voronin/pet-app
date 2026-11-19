import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/shared/ui';

export default function EventsScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('tabs.events')} subtitle={t('placeholder.comingSoon')} />;
}
