import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { Screen, TopBar } from './layout';
import { AppText, Button, Card } from './ui';

/** Tab content for hosts who skipped onboarding: the app stays usable (account, plan) and setup is one tap away. */
export function NoProperty() {
  const { space } = useTheme();
  return (
    <Screen contentStyle={{ gap: space[5] }}>
      <TopBar />
      <Card style={{ gap: space[3] }}>
        <AppText variant="h2" weight="800" accessibilityRole="header">
          {t('properties.emptyTitle')}
        </AppText>
        <AppText variant="body" color="textSecondary">
          {t('properties.emptyText')}
        </AppText>
        <Button icon={Plus} label={t('properties.add')} onPress={() => router.push('/onboarding')} />
      </Card>
    </Screen>
  );
}
