import { View } from 'react-native';
import { router } from 'expo-router';
import { Check, Plus } from 'lucide-react-native';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { useSelectedProperty } from '@/lib/selected-property';
import { PropertyCard } from './blocks';
import { Sheet } from './feedback';
import { Button } from './ui';

export function PropertyPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c, space } = useTheme();
  const { properties, property, select } = useSelectedProperty();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('today.selectProperty')}>
      <View style={{ gap: space[3] }}>
        {properties.map((p) => (
          <PropertyCard
            key={p.id}
            property={p}
            onPress={() => {
              select(p.id);
              onClose();
            }}
            right={p.id === property?.id ? <Check size={22} color={c.positive} /> : undefined}
          />
        ))}
        <Button
          kind="ghost"
          icon={Plus}
          label={t('properties.add')}
          onPress={() => {
            onClose();
            router.push('/onboarding');
          }}
        />
      </View>
    </Sheet>
  );
}
