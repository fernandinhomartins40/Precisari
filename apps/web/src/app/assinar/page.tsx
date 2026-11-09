import { redirect } from 'next/navigation';

/** Entry point used by the mobile app: /assinar?plano=pro|auto → /checkout with the plan preselected. */
export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ plano?: string | string[] }> }) {
  const { plano } = await searchParams;
  const value = (Array.isArray(plano) ? plano[0] : plano)?.toLowerCase();
  redirect(value === 'auto' || value === 'pro' ? `/checkout?plano=${value}` : '/checkout');
}
