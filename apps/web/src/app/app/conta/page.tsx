import type { Metadata } from 'next';
import { t } from '@/i18n';
import { AccountView } from './account-view';

export const metadata: Metadata = { title: t('account.metaTitle') };

export default function AccountPage() {
  return <AccountView />;
}
