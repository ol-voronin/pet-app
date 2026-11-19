import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/shared/ui/PlaceholderScreen';

export default function PetsScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('tabs.pets')} subtitle={t('placeholder.comingSoon')} />;
}
