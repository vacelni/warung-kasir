// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('./api', () => ({
  signIn: mocks.signIn,
  hasStoredSession: vi.fn().mockResolvedValue(false),
}));

vi.mock('./demo', () => ({
  DEMO_MODE: true,
  DEMO_ACCOUNTS: [
    { label: 'Coba sebagai Pemilik', email: 'owner@demo.warungkasir.test', password: 'demo12345' },
    { label: 'Coba sebagai Kasir', email: 'kasir@demo.warungkasir.test', password: 'demo12345' },
  ],
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LoginForm in the public demo build', () => {
  it('signs in with one tap as the demo cashier, skipping the form fields', async () => {
    mocks.signIn.mockResolvedValue({ ok: true, profile: { id: 'x', storeId: 'y', name: 'Rina', role: 'cashier' } });
    render(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Coba sebagai Kasir' }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/kasir'));
    expect(mocks.signIn).toHaveBeenCalledWith('kasir@demo.warungkasir.test', 'demo12345');
  });

  it('shows the error when the demo account cannot sign in', async () => {
    mocks.signIn.mockResolvedValue({ ok: false, message: 'Email atau password salah.' });
    render(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Coba sebagai Pemilik' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Email atau password salah.');
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
