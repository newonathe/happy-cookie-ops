import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in · The Happy Cookie Ops' };

export default function SignInPage() {
  // useSearchParams() suspends during prerender, so the form needs a boundary or the
  // build fails. The fallback matches the form's footprint to avoid a layout jump.
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F1EFEE' }} />}>
      <SignInForm />
    </Suspense>
  );
}
