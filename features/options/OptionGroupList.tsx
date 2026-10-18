'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { LoadingState } from '@/components/shared/LoadingState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/features/auth/AuthProvider';
import { formatRupiah } from '@/lib/money';
import { deleteGroup } from './api';
import { GroupForm } from './GroupForm';
import type { OptionChoice, OptionGroup } from './model';
import { useOptionGroups } from './useOptionGroups';

type DialogState = { type: 'create' } | { type: 'edit'; groupId: string } | { type: 'delete'; group: OptionGroup };

/** "Level 1, Level 3 (+Rp0)" style preview of the first few choices. */
function previewChoices(choices: readonly OptionChoice[]): string {
  const shown = choices.slice(0, 4).map((choice) => (choice.priceDelta > 0 ? `${choice.name} +${formatRupiah(choice.priceDelta)}` : choice.name));
  return shown.join(', ') + (choices.length > 4 ? `, +${choices.length - 4} lagi` : '');
}

/**
 * Owner screen for option groups (UI_SPEC A.17a): the choices a menu item offers at the till, such
 * as level, part of the chicken, rice, and extras. Groups are attached to menu items in Menu.
 */
export function OptionGroupList() {
  const { storeId } = useProfile();
  const toast = useToast();
  const { state, retry, refresh } = useOptionGroups();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // A new key per opening gives each form fresh state.
  const [generation, setGeneration] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<string>();

  function show(next: DialogState) {
    setGeneration((value) => value + 1);
    setDeleteFailure(undefined);
    setDialog(next);
  }

  const close = () => setDialog(null);

  const groups = state.status === 'ready' ? state.groups : [];
  const usage = new Map<string, number>();
  if (state.status === 'ready') {
    for (const link of state.links) usage.set(link.groupId, (usage.get(link.groupId) ?? 0) + 1);
  }
  const editing = dialog?.type === 'edit' ? groups.find((group) => group.id === dialog.groupId) : undefined;

  async function created(id: string) {
    await refresh();
    show({ type: 'edit', groupId: id });
  }

  async function confirmDelete(group: OptionGroup) {
    if (deleting) return;
    setDeleting(true);
    setDeleteFailure(undefined);
    const result = await deleteGroup(group.id);
    setDeleting(false);
    if (!result.ok) {
      setDeleteFailure(result.message);
      return;
    }
    close();
    toast.show('Grup pilihan dihapus.', 'success');
    await refresh();
  }

  return (
    <>
      <PageHeader
        title="Pilihan Menu"
        action={
          state.status === 'ready' && (
            <Button onClick={() => show({ type: 'create' })}>
              <Icon name="plus" size={20} />
              TAMBAH GRUP
            </Button>
          )
        }
      />

      {state.status === 'loading' && <LoadingState label="Memuat pilihan menu…" />}

      {state.status === 'error' && (
        <ErrorState
          title="Pilihan menu gagal dimuat"
          description="Daftar pilihan tidak dapat diambil. Periksa koneksi internet lalu coba lagi."
          actions={<Button onClick={retry}>COBA LAGI</Button>}
        />
      )}

      {state.status === 'ready' && groups.length === 0 && (
        <EmptyState
          icon="options"
          title="Belum ada pilihan menu"
          description="Buat grup seperti Level, Bagian ayam, atau Nasi, lalu pasang di menu seperti Geprek. Menu tanpa pilihan tetap langsung masuk ke pesanan."
          actions={<Button onClick={() => show({ type: 'create' })}>TAMBAH GRUP</Button>}
        />
      )}

      {state.status === 'ready' && groups.length > 0 && (
        <Card padded={false}>
          <ul className="divide-y divide-border">
            {groups.map((group) => (
              <li key={group.id}>
                <button
                  type="button"
                  onClick={() => show({ type: 'edit', groupId: group.id })}
                  className="flex min-h-20 w-full items-center gap-3 px-4 py-3 text-left active:bg-subtle hover:bg-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold break-words text-foreground">{group.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={group.required ? 'warning' : 'neutral'}>{group.required ? 'Wajib' : 'Opsional'}</Badge>
                      <Badge>{group.allowMultiple ? 'Boleh banyak' : 'Pilih satu'}</Badge>
                      <span className="text-caption text-muted">Dipakai di {usage.get(group.id) ?? 0} menu</span>
                    </span>
                    <span className="mt-1 block text-body break-words text-muted">
                      {group.choices.length === 0 ? 'Belum ada pilihan.' : previewChoices(group.choices)}
                    </span>
                  </span>
                  <Icon name="chevronRight" className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <GroupForm
        key={`form-${generation}`}
        open={dialog?.type === 'create' || (dialog?.type === 'edit' && editing !== undefined)}
        group={editing}
        storeId={storeId}
        usedBy={editing ? (usage.get(editing.id) ?? 0) : 0}
        onClose={close}
        onChanged={refresh}
        onCreated={(id) => void created(id)}
        onDelete={(group) => show({ type: 'delete', group })}
      />

      <Dialog
        open={dialog?.type === 'delete'}
        onClose={close}
        dismissible={!deleting}
        title="Hapus grup pilihan?"
        description={
          dialog?.type === 'delete'
            ? `"${dialog.group.name}" dan ${dialog.group.choices.length} pilihannya akan dihapus, juga dari ${usage.get(dialog.group.id) ?? 0} menu yang memakainya. Transaksi yang sudah terjadi tidak berubah.`
            : undefined
        }
        actions={
          <>
            <Button variant="danger" disabled={deleting} onClick={() => dialog?.type === 'delete' && void confirmDelete(dialog.group)}>
              {deleting ? 'MENGHAPUS…' : 'HAPUS'}
            </Button>
            <Button variant="secondary" data-autofocus disabled={deleting} onClick={close}>
              BATAL
            </Button>
          </>
        }
      >
        {deleteFailure && <p role="alert" className="text-body font-medium text-danger-ink">{deleteFailure}</p>}
      </Dialog>
    </>
  );
}
