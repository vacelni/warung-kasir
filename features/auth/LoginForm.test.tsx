// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_MESSAGES } from './account';
import type { SignInResult } from './api';
import { LoginForm, SignedOutNotice } from './LoginForm';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  signIn: vi.fn(),
  hasStoredSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('./api', () => ({
  signIn: mocks.signIn,
  hasStoredSession: mocks.hasStoredSession,
}));

const owner = {
  id: 'a1000000-0000-4000-8000-000000000001',
  storeId: '5a000000-0000-4000-8000-000000000001',
  name: 'Bu Sari',
  role: 'owner' as const,
};

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'MASUK' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.hasStoredSession.mockResolvedValue(false);
  mocks.signIn.mockResolvedValue({ ok: true, profile: owner } satisfies SignInResult);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LoginForm', () => {
  it('shows inline errors for empty fields and makes no request', () => {
    render(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: 'MASUK' }));

    expect(screen.getByText(AUTH_MESSAGES.required.email)).toBeTruthy();
    expect(screen.getByText(AUTH_MESSAGES.required.password)).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before any request', () => {
    render(<LoginForm />);

    fillAndSubmit('andi', 'password123');

    expect(screen.getByText(AUTH_MESSAGES.invalidEmail)).toBeTruthy();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('signs in with the trimmed email and opens the cashier', async () => {
    render(<LoginForm />);

    fillAndSubmit('  owner.a@warungkasir.test ', 'password123');

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/kasir'));
    expect(mocks.signIn).toHaveBeenCalledWith('owner.a@warungkasir.test', 'password123');
  });

  it('shows the error and allows another attempt after a failed login', async () => {
    mocks.signIn.mockResolvedValue({ ok: false, message: AUTH_MESSAGES.invalidCredentials });
    render(<LoginForm />);

    fillAndSubmit('owner.a@warungkasir.test', 'salah');

    expect((await screen.findByRole('alert')).textContent).toBe('Email atau password salah.');
    expect(screen.getByRole('button', { name: 'MASUK' }).hasAttribute('disabled')).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('disables the button while the request runs and ignores a second submit', async () => {
    let finish: (result: SignInResult) => void = () => {};
    mocks.signIn.mockReturnValue(new Promise<SignInResult>((resolve) => (finish = resolve)));
    render(<LoginForm />);

    fillAndSubmit('owner.a@warungkasir.test', 'password123');
    const button = await screen.findByRole('button', { name: 'MEMPROSES…' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.submit(button.closest('form') as HTMLFormElement);

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    finish({ ok: false, message: AUTH_MESSAGES.invalidCredentials });
    await screen.findByRole('alert');
  });

  it('explains that login needs a connection when offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<LoginForm />);

    fillAndSubmit('owner.a@warungkasir.test', 'password123');

    expect(screen.getByRole('alert').textContent).toBe('Koneksi internet diperlukan untuk masuk.');
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('goes straight to the cashier when a session already exists', async () => {
    mocks.hasStoredSession.mockResolvedValue(true);
    render(<LoginForm />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/kasir'));
  });

  it('toggles password visibility', () => {
    render(<LoginForm />);
    const password = screen.getByLabelText('Password');
    expect(password.getAttribute('type')).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan password' }));

    expect(password.getAttribute('type')).toBe('text');
  });
});

describe('SignedOutNotice', () => {
  it('explains a sign-out caused by the account check: deactivated or password reset (INFO-3)', () => {
    mocks.searchParams = new URLSearchParams('alasan=inactive');
    render(<SignedOutNotice />);

    expect(screen.getByRole('status').textContent).toBe(AUTH_MESSAGES.accessEnded);
  });

  it('renders nothing without a reason', () => {
    const { container } = render(<SignedOutNotice />);

    expect(container.textContent).toBe('');
  });
});

describe('before hydration (SEC-02)', () => {
  it('the prerendered form posts and its submit button is disabled, so no credential can reach a URL', async () => {
    const { renderToString } = await import('react-dom/server');
    const html = renderToString(<LoginForm />);
    const form = new DOMParser().parseFromString(html, 'text/html');

    expect(form.querySelector('form')?.getAttribute('method')).toBe('post');
    const submit = form.querySelector('button[type="submit"]');
    expect(submit?.textContent).toBe('MASUK');
    expect(submit?.hasAttribute('disabled')).toBe(true);
  });

  it('after hydration the button is enabled', () => {
    render(<LoginForm />);
    expect((screen.getByRole('button', { name: 'MASUK' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
