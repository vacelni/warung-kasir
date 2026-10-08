'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ErrorState } from '@/components/shared/ErrorState';
import { LoadingState } from '@/components/shared/LoadingState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { LinkRow } from '@/components/ui/LinkRow';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/features/auth/AuthProvider';
import { getStoreProfile, saveReceiptNote, saveStoreProfile, type SaveResult } from './api';
import { normalizeReceiptNote, validateStoreProfile, type ProfileFormErrors, type ProfileFormValues, type StoreProfile } from './validation';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; store: StoreProfile };
type Editing = 'profile' | 'receipt' | null;

/**
 * Pengaturan (UI_SPEC A.19, PRD §26): grouped sections with the current values, each edited in
 * its own sheet. Only groups that have something in the MVP are shown: Profil Warung, Struk, and
 * the Data / Tentang links. No tax, printer, discount, theme, or logo settings exist.
 */
export function StoreSettings() {
  const { storeId } = useProfile();
  const toast = useToast();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [editing, setEditing] = useState<Editing>(null);
  const [generation, setGeneration] = useState(0);

  const load = useCallback(async (): Promise<State> => {
    try {
      return { status: 'ready', store: await getStoreProfile(storeId) };
    } catch (error) {
      console.error('Could not load the settings:', error);
      return { status: 'error' };
    }
  }, [storeId]);

  useEffect(() => {
    let active = true;
    void load().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [load]);

  function retry() {
    setState({ status: 'loading' });
    void load().then(setState);
  }

  function edit(section: Editing) {
    setGeneration((value) => value + 1);
    setEditing(section);
  }

  async function saved() {
    setEditing(null);
    toast.show('Pengaturan disimpan.', 'success');
    setState(await load());
  }

  const close = () => setEditing(null);

  return (
    <div className="max-w-xl">
      <PageHeader title="Pengaturan" />

      {state.status === 'loading' && <LoadingState label="Memuat pengaturan…" />}

      {state.status === 'error' && (
        <ErrorState
          title="Pengaturan gagal dimuat"
          description="Data warung tidak dapat diambil. Periksa koneksi internet lalu coba lagi."
          actions={<Button onClick={retry}>COBA LAGI</Button>}
        />
      )}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-6">
          <Section title="Profil Warung" onEdit={() => edit('profile')} editLabel="Ubah profil warung">
            <Value label="Nama warung" value={state.store.name} />
            <Value label="Alamat" value={state.store.address} />
            <Value label="Telepon" value={state.store.phone} />
          </Section>

          <Section title="Struk" onEdit={() => edit('receipt')} editLabel="Ubah catatan struk">
            <Value label="Catatan struk" value={state.store.receiptNote} />
          </Section>

          <section aria-labelledby="settings-data" className="flex flex-col gap-2">
            <h2 id="settings-data" className="text-section-title font-semibold text-foreground">
              Data
            </h2>
            <Card padded={false} className="divide-y divide-border overflow-hidden">
              <LinkRow href="/backup" label="Backup / Export" icon="download" description="Unduh data warung sebagai file CSV" />
            </Card>
          </section>

          <section aria-labelledby="settings-about" className="flex flex-col gap-2">
            <h2 id="settings-about" className="text-section-title font-semibold text-foreground">
              Tentang
            </h2>
            <Card padded={false} className="divide-y divide-border overflow-hidden">
              <LinkRow href="/tentang" label="Tentang aplikasi" icon="info" />
            </Card>
          </section>

          {editing === 'profile' && (
            <ProfileForm key={`profile-${generation}`} storeId={storeId} store={state.store} onClose={close} onSaved={saved} />
          )}
          {editing === 'receipt' && (
            <ReceiptForm key={`receipt-${generation}`} storeId={storeId} store={state.store} onClose={close} onSaved={saved} />
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, editLabel, onEdit, children }: { title: string; editLabel: string; onEdit: () => void; children: ReactNode }) {
  const id = `settings-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-section-title font-semibold text-foreground">
          {title}
        </h2>
        <Button variant="secondary" onClick={onEdit} aria-label={editLabel}>
          Ubah
        </Button>
      </div>
      <Card>
        <dl className="flex flex-col gap-3">{children}</dl>
      </Card>
    </section>
  );
}

function Value({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-caption text-muted">{label}</dt>
      <dd className={value ? 'text-base break-words whitespace-pre-line text-foreground' : 'text-base text-muted'}>
        {value ?? 'Belum diisi'}
      </dd>
    </div>
  );
}

type FormProps = { storeId: string; store: StoreProfile; onClose: () => void; onSaved: () => void };

function SettingsSheet({
  title,
  formId,
  submitting,
  failure,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  formId: string;
  submitting: boolean;
  failure?: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!submitting}
      title={title}
      actions={
        <>
          <Button type="submit" form={formId} disabled={submitting}>
            {submitting ? 'MENYIMPAN…' : 'SIMPAN'}
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

/** Runs a save with a busy flag; returns the failure message, if any. */
function useSave() {
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string>();
  async function run(save: () => Promise<SaveResult>): Promise<boolean> {
    setFailure(undefined);
    setSubmitting(true);
    const result = await save();
    setSubmitting(false);
    if (!result.ok) setFailure(result.message);
    return result.ok;
  }
  return { submitting, failure, run };
}

function ProfileForm({ storeId, store, onClose, onSaved }: FormProps) {
  const [values, setValues] = useState<ProfileFormValues>({
    name: store.name,
    address: store.address ?? '',
    phone: store.phone ?? '',
  });
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const { submitting, failure, run } = useSave();

  function change(field: keyof ProfileFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const checked = validateStoreProfile(values);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    if (await run(() => saveStoreProfile(storeId, checked.input))) onSaved();
  }

  return (
    <SettingsSheet title="Profil warung" formId="store-profile-form" submitting={submitting} failure={failure} onClose={onClose} onSubmit={submit}>
      <Input label="Nama warung" value={values.name} onChange={(e) => change('name', e.target.value)} error={errors.name} autoComplete="off" data-autofocus />
      <Textarea label="Alamat" value={values.address} onChange={(e) => change('address', e.target.value)} error={errors.address} />
      <Input
        label="Telepon"
        type="tel"
        inputMode="tel"
        value={values.phone}
        onChange={(e) => change('phone', e.target.value)}
        error={errors.phone}
        autoComplete="off"
      />
    </SettingsSheet>
  );
}

function ReceiptForm({ storeId, store, onClose, onSaved }: FormProps) {
  const [note, setNote] = useState(store.receiptNote ?? '');
  const { submitting, failure, run } = useSave();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (await run(() => saveReceiptNote(storeId, normalizeReceiptNote(note)))) onSaved();
  }

  return (
    <SettingsSheet title="Catatan struk" formId="receipt-note-form" submitting={submitting} failure={failure} onClose={onClose} onSubmit={submit}>
      <Textarea
        label="Catatan struk"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        hint="Contoh: Terima kasih :) — kosongkan untuk menghapus."
        data-autofocus
      />
    </SettingsSheet>
  );
}
