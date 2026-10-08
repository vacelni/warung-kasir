'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { AUTH_MESSAGES, signedOutNotice, validateCredentials, type CredentialErrors } from './account';
import { hasStoredSession, signIn } from './api';

const INPUT_CLASSES =
  'min-h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 ' +
  'focus:border-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-200 ' +
  'aria-invalid:border-red-600 disabled:bg-gray-100';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // An existing session goes straight to the cashier (PRD §11).
  useEffect(() => {
    let active = true;
    hasStoredSession()
      .then((exists) => {
        if (active && exists) router.replace('/kasir');
      })
      .catch((error: unknown) => console.error('Could not check the stored session:', error));
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const trimmedEmail = email.trim();
    const errors = validateCredentials(trimmedEmail, password);
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;

    // Login always needs the server (UI_SPEC A.8).
    if (!navigator.onLine) {
      setFormError(AUTH_MESSAGES.offline);
      return;
    }

    setPending(true);
    try {
      const result = await signIn(trimmedEmail, password);
      if (result.ok) {
        // Stay disabled while navigating so the form cannot be submitted twice.
        router.replace('/kasir');
        return;
      }
      setFormError(result.message);
    } catch (error) {
      console.error('Login failed unexpectedly:', error);
      setFormError(AUTH_MESSAGES.unknown);
    }
    setPending(false);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5" aria-busy={pending}>
      {formError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-gray-800">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          className={INPUT_CLASSES}
        />
        {fieldErrors.email && (
          <p id="email-error" className="text-sm text-red-700">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-gray-800">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            className={`${INPUT_CLASSES} pr-14`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-gray-600 focus-visible:outline-2 focus-visible:outline-orange-700"
          >
            <EyeIcon crossed={showPassword} />
          </button>
        </div>
        {fieldErrors.password && (
          <p id="password-error" className="text-sm text-red-700">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'MEMPROSES…' : 'MASUK'}
      </Button>
    </form>
  );
}

/** Explains why the app sent the user back to login. Reads the URL, so it renders inside Suspense. */
export function SignedOutNotice() {
  const notice = signedOutNotice(useSearchParams());
  if (!notice) return null;
  return (
    <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {notice}
    </p>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
  );
}
