import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/shared/ui/PlaceholderScreen';

export default function ProfileScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('tabs.profile')} subtitle={t('placeholder.comingSoon')} />;
}
