import { Text } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { CalendarCheck, CalendarDays, ChartNoAxesColumn, House } from 'lucide-react-native';
import { t } from '@/i18n';
import { fontFor, useTheme } from '@/theme';
import { typography } from '@precisari/design-tokens';
import { useSelectedProperty } from '@/lib/selected-property';
import { useSession } from '@/lib/session';

/** Onboarding is offered once per app session; "Configurar depois" lets the host into the app (App Review 2.1). */
let onboardingOffered = false;

export default function TabsLayout() {
  const { c, name } = useTheme();
  const { status } = useSession();
  const { properties, isLoading } = useSelectedProperty();

  // New hosts go straight to onboarding (journey 4.1), but can skip it.
  if (status === 'signedIn' && !isLoading && properties.length === 0 && !onboardingOffered) {
    onboardingOffered = true;
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accentStrong,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        // Active label stays navy (AA on white); the tangerine icon marks the active tab.
        tabBarLabel: ({ focused, children }) => (
          <Text
            allowFontScaling
            maxFontSizeMultiplier={1.4}
            style={{
              fontFamily: fontFor('caption', focused ? '700' : '500'),
              fontSize: typography.caption.size,
              color: focused ? (name === 'dark' ? c.accentStrong : c.textPrimary) : c.textSecondary,
            }}
          >
            {children}
          </Text>
        ),
        tabBarAllowFontScaling: true,
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.today'), tabBarIcon: ({ color, size }) => <CalendarCheck color={color} size={size} strokeWidth={2} /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: t('tabs.calendar'), tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} strokeWidth={2} /> }}
      />
      <Tabs.Screen
        name="results"
        options={{ title: t('tabs.results'), tabBarIcon: ({ color, size }) => <ChartNoAxesColumn color={color} size={size} strokeWidth={2} /> }}
      />
      <Tabs.Screen
        name="properties"
        options={{ title: t('tabs.properties'), tabBarIcon: ({ color, size }) => <House color={color} size={size} strokeWidth={2} /> }}
      />
    </Tabs>
  );
}
