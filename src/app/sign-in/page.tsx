import type { Metadata } from 'next';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in · The Happy Cookie Ops' };

export default function SignInPage() {
  // The form reads its return path at submit, so it prerenders whole: the static page shows
  // the form before any JavaScript runs.
  return <SignInForm />;
}
