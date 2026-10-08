'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { AUTH_MESSAGES, signedOutNotice, validateCredentials, type CredentialErrors } from './account';
import { hasStoredSession, signIn } from './api';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      {formError && <Alert tone="danger">{formError}</Alert>}

      <Input
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending}
        error={fieldErrors.email}
      />

      <PasswordInput
        label="Password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={pending}
        error={fieldErrors.password}
      />

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
    <Alert tone="warning" className="mb-5">
      {notice}
    </Alert>
  );
}
