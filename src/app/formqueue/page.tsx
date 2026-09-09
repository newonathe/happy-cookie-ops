import type { Metadata } from 'next';
import { OpsApp } from '@/components/app/ops-app';

export const metadata: Metadata = { title: 'Form queue · The Happy Cookie Ops' };

export default function Page() {
  return <OpsApp initialScreen="formqueue" />;
}
