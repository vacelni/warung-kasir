'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { LoadingState } from '@/components/shared/LoadingState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { setCashierActive, type Cashier } from './api';
import { NewCashierForm, RenameCashierForm, ResetPasswordForm } from './CashierForms';
import { CashierRow } from './CashierRow';
import { useCashiers } from './useCashiers';

type DialogState =
  | { type: 'create' }
  | { type: 'actions'; cashier: Cashier }
  | { type: 'rename'; cashier: Cashier }
  | { type: 'password'; cashier: Cashier };

/**
 * Owner screen for employees (UI_SPEC A.18, PRD §25): the store's cashiers with their status;
 * add a cashier, edit the name, reset the password, Nonaktifkan / Aktifkan.
 *
 * Only cashiers are listed and every action targets a cashier, so the owner's own account never
 * gets a deactivate action. Create, status, and password go through the admin-cashier Edge
 * Function; the name is a direct, RLS-checked update.
 */
export function CashierList() {
  const toast = useToast();
  const { state, retry, refresh } = useCashiers();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  // A new key per opening gives each form fresh state.
  const [generation, setGeneration] = useState(0);

  function show(next: DialogState) {
    setGeneration((value) => value + 1);
    setDialog(next);
  }

  const close = () => setDialog(null);

  async function saved(message: string) {
    close();
    toast.show(message, 'success');
    await refresh();
  }

  async function toggleActive(cashier: Cashier) {
    if (changingStatus) return;
    const nextActive = !cashier.isActive;
    setChangingStatus(true);
    const result = await setCashierActive(cashier.id, nextActive);
    setChangingStatus(false);
    close();
    if (!result.ok) {
      toast.show(result.message, 'danger');
      await refresh();
      return;
    }
    toast.show(`${cashier.name} ${nextActive ? 'diaktifkan' : 'dinonaktifkan'}.`, 'success');
    await refresh();
  }

  const selected = dialog && 'cashier' in dialog ? dialog.cashier : undefined;

  return (
    <>
      <PageHeader
        title="Karyawan"
        action={
          state.status === 'ready' && (
            <Button onClick={() => show({ type: 'create' })}>
              <Icon name="plus" size={20} />
              TAMBAH KASIR
            </Button>
          )
        }
      />

      {state.status === 'loading' && <LoadingState label="Memuat karyawan…" />}

      {state.status === 'error' && (
        <ErrorState
          title="Karyawan gagal dimuat"
          description="Daftar karyawan tidak dapat diambil. Periksa koneksi internet lalu coba lagi."
          actions={<Button onClick={retry}>COBA LAGI</Button>}
        />
      )}

      {state.status === 'ready' && state.cashiers.length === 0 && (
        <EmptyState
          icon="users"
          title="Belum ada kasir"
          description="Tambahkan akun kasir agar karyawan dapat melakukan transaksi."
          actions={<Button onClick={() => show({ type: 'create' })}>TAMBAH KASIR</Button>}
        />
      )}

      {state.status === 'ready' && state.cashiers.length > 0 && (
        <Card padded={false}>
          <ul className="divide-y divide-border">
            {state.cashiers.map((cashier) => (
              <CashierRow key={cashier.id} cashier={cashier} onOpenActions={(target) => show({ type: 'actions', cashier: target })} />
            ))}
          </ul>
        </Card>
      )}

      <Dialog
        open={dialog?.type === 'actions'}
        onClose={close}
        dismissible={!changingStatus}
        title={selected?.name ?? ''}
        description={selected ? `Cashier · ${selected.isActive ? 'Aktif' : 'Nonaktif'}` : undefined}
      >
        {selected && (
          <div className="flex flex-col gap-3">
            <Button variant="secondary" disabled={changingStatus} onClick={() => show({ type: 'rename', cashier: selected })}>
              Edit Profil
            </Button>
            <Button variant="secondary" disabled={changingStatus} onClick={() => show({ type: 'password', cashier: selected })}>
              Reset Password
            </Button>
            {/* Kept last and apart from the safe actions (UI_SPEC A.6). */}
            {selected.isActive ? (
              <Button variant="danger-outline" className="mt-3" disabled={changingStatus} onClick={() => void toggleActive(selected)}>
                {changingStatus ? 'MEMPROSES…' : 'Nonaktifkan'}
              </Button>
            ) : (
              <Button className="mt-3" disabled={changingStatus} onClick={() => void toggleActive(selected)}>
                {changingStatus ? 'MEMPROSES…' : 'Aktifkan'}
              </Button>
            )}
            {selected.isActive && (
              <p className="text-caption text-muted">Kasir nonaktif tidak dapat masuk atau memakai aplikasi sampai diaktifkan kembali.</p>
            )}
          </div>
        )}
      </Dialog>

      <NewCashierForm key={`create-${generation}`} open={dialog?.type === 'create'} onClose={close} onSaved={saved} />
      {dialog?.type === 'rename' && (
        <RenameCashierForm key={`rename-${generation}`} open cashier={dialog.cashier} onClose={close} onSaved={saved} />
      )}
      {dialog?.type === 'password' && (
        <ResetPasswordForm key={`password-${generation}`} open cashier={dialog.cashier} onClose={close} onSaved={saved} />
      )}
    </>
  );
}
