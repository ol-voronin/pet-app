import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/shared/ui';

export default function MapScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('tabs.map')} subtitle={t('placeholder.comingSoon')} />;
}
