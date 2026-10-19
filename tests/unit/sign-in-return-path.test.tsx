import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  signIn: vi.fn()
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace })
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithPassword: mocks.signIn } })
}));
import { SignInForm } from '@/app/sign-in/sign-in-form';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signIn.mockResolvedValue({ error: null });
  window.history.replaceState(null, '', '/sign-in');
});
afterEach(cleanup);
function submit() {
  render(<SignInForm />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'staff@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'PASSWORD_CANARY' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}
it.each([
  ['next=/orders', '/orders'],
  ['next=javascript%3Aalert(1)', '/'],
  ['next=%2F%2Fevil.test', '/'],
  ['next=/orders&next=/settings', '/']
])('uses only a safe replacement after successful sign-in: %s', async (query, expected) => {
  window.history.replaceState(null, '', '/sign-in?' + query);
  submit();
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(expected));
  expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith({
    email: 'staff@example.test',
    password: 'PASSWORD_CANARY'
  });
});
it('does not navigate after an authentication error', async () => {
  window.history.replaceState(null, '', '/sign-in?next=/orders');
  mocks.signIn.mockResolvedValue({ error: { message: 'PRIVATE_PROVIDER_ERROR' } });
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'That email and password do not match an account.'
  );
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(screen.queryByText('PRIVATE_PROVIDER_ERROR')).toBeNull();
});
it('prerenders the whole form: nothing suspends on the server', async () => {
  const { renderToString } = await import('react-dom/server');
  const html = renderToString(<SignInForm />);
  expect(html).toContain('Email');
  expect(html).toContain('Password');
  expect(html).toContain('Sign in');
});
