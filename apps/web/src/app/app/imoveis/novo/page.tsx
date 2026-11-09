import type { Metadata } from 'next';
import { t } from '@/i18n';
import { OnboardingWizard } from './onboarding-wizard';

export const metadata: Metadata = { title: t('onboarding.metaTitle') };

export default function NewPropertyPage() {
  return <OnboardingWizard />;
}
