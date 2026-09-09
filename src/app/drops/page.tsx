import type { Metadata } from 'next';
import { OpsApp } from '@/components/app/ops-app';

export const metadata: Metadata = { title: 'Drops · The Happy Cookie Ops' };

export default function Page() {
  return <OpsApp initialScreen="drops" />;
}
