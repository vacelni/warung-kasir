'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { createCashier, renameCashier, resetCashierPassword, type AdminResult, type Cashier } from './api';
import { nameError, passwordError, validateNewCashier, type CashierFormErrors, type CashierFormValues } from './validation';

// The three owner forms of UI_SPEC A.18 (tambah kasir, edit nama, reset password). Each one is
// mounted with a fresh `key` per opening so its fields start empty (or from the cashier).

const PASSWORD_HINT = 'Minimal 8 karakter. Berikan password ini kepada kasir secara langsung.';

type SheetFormProps = {
  open: boolean;
  formId: string;
  title: string;
  description?: string;
  submitLabel: string;
  submitting: boolean;
  failure?: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
};

/** Bottom sheet with one form, an inline failure message, and SIMPAN / BATAL. */
function SheetForm({ open, formId, title, description, submitLabel, submitting, failure, onClose, onSubmit, children }: SheetFormProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!submitting}
      title={title}
      description={description}
      actions={
        <>
          <Button type="submit" form={formId} disabled={submitting}>
            {submitting ? 'MENYIMPAN…' : submitLabel}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            BATAL
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {failure && <Alert tone="danger">{failure}</Alert>}
        {children}
      </form>
    </Dialog>
  );
}

/**
 * Runs one submission: sets the busy state, then routes a failure either to its field or to the
 * form-level alert. Returns true on success.
 */
function useSubmission<F extends string>(setFieldError: (field: F, message: string) => void, fields: readonly F[]) {
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string>();

  async function run(action: () => Promise<AdminResult>): Promise<boolean> {
    setFailure(undefined);
    setSubmitting(true);
    const result = await action();
    setSubmitting(false);
    if (result.ok) return true;
    const field = result.field as F | undefined;
    if (field && fields.includes(field)) setFieldError(field, result.message);
    else setFailure(result.message);
    return false;
  }

  return { submitting, failure, run };
}

type FormProps = { open: boolean; onClose: () => void; onSaved: (message: string) => void };

/** [+] Tambah kasir: name, login email, initial password. Always creates a cashier (role is fixed). */
export function NewCashierForm({ open, onClose, onSaved }: FormProps) {
  const [values, setValues] = useState<CashierFormValues>({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<CashierFormErrors>({});
  const { submitting, failure, run } = useSubmission<keyof CashierFormValues>(
    (field, message) => setErrors((current) => ({ ...current, [field]: message })),
    ['name', 'email', 'password'],
  );

  function change(field: keyof CashierFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const checked = validateNewCashier(values);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    if (await run(() => createCashier(checked.input))) onSaved(`Akun kasir ${checked.input.name} dibuat.`);
  }

  return (
    <SheetForm
      open={open}
      formId="new-cashier-form"
      title="Tambah kasir"
      description="Kasir masuk dengan email dan password ini."
      submitLabel="SIMPAN"
      submitting={submitting}
      failure={failure}
      onClose={onClose}
      onSubmit={submit}
    >
      <Input
        label="Nama"
        value={values.name}
        onChange={(event) => change('name', event.target.value)}
        error={errors.name}
        autoComplete="off"
        data-autofocus
      />
      <Input
        label="Email login"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        autoComplete="off"
        value={values.email}
        onChange={(event) => change('email', event.target.value)}
        error={errors.email}
      />
      <PasswordInput
        label="Password"
        autoComplete="new-password"
        value={values.password}
        onChange={(event) => change('password', event.target.value)}
        error={errors.password}
        hint={PASSWORD_HINT}
      />
    </SheetForm>
  );
}

/** Edit Profil: the name is the only profile field the owner may change (DATABASE D.3). */
export function RenameCashierForm({ cashier, open, onClose, onSaved }: FormProps & { cashier: Cashier }) {
  const [name, setName] = useState(cashier.name);
  const [error, setError] = useState<string>();
  const { submitting, failure, run } = useSubmission<'name'>((_field, message) => setError(message), ['name']);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const invalid = nameError(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    const trimmed = name.trim();
    if (await run(() => renameCashier(cashier.id, trimmed))) onSaved('Nama kasir diperbarui.');
  }

  return (
    <SheetForm
      open={open}
      formId="rename-cashier-form"
      title="Edit profil"
      submitLabel="SIMPAN"
      submitting={submitting}
      failure={failure}
      onClose={onClose}
      onSubmit={submit}
    >
      <Input
        label="Nama"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setError(undefined);
        }}
        error={error}
        autoComplete="off"
        data-autofocus
      />
    </SheetForm>
  );
}

/** Reset Password: the owner sets a new password and gives it to the cashier (no email recovery, E.8). */
export function ResetPasswordForm({ cashier, open, onClose, onSaved }: FormProps & { cashier: Cashier }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const { submitting, failure, run } = useSubmission<'password'>((_field, message) => setError(message), ['password']);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const invalid = passwordError(password);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (await run(() => resetCashierPassword(cashier.id, password))) onSaved(`Password ${cashier.name} direset.`);
  }

  return (
    <SheetForm
      open={open}
      formId="reset-password-form"
      title="Reset password"
      description={`Password baru untuk ${cashier.name}.`}
      submitLabel="RESET PASSWORD"
      submitting={submitting}
      failure={failure}
      onClose={onClose}
      onSubmit={submit}
    >
      <PasswordInput
        label="Password baru"
        autoComplete="new-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setError(undefined);
        }}
        error={error}
        hint={PASSWORD_HINT}
        data-autofocus
      />
    </SheetForm>
  );
}
