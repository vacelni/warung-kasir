'use client';

import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { ToggleButton } from '@/components/ui/ToggleButton';
import { useToast } from '@/components/ui/Toast';
import { createGroup, updateGroup } from './api';
import { ChoiceEditor } from './ChoiceEditor';
import type { OptionGroup } from './model';
import { MAX_OPTION_NAME_LENGTH, validateOptionName } from './validation';

type GroupFormProps = {
  open: boolean;
  /** The group being edited; undefined creates a new one. */
  group?: OptionGroup;
  storeId: string;
  /** How many menu items use the group, shown before deleting it. */
  usedBy: number;
  onClose: () => void;
  /** After any change to the group or its choices: reload the list. */
  onChanged: () => Promise<void>;
  /** A new group was created: the parent reopens it so choices can be added straight away. */
  onCreated: (id: string) => void;
  onDelete: (group: OptionGroup) => void;
};

const FORM_ID = 'option-group-form';

/**
 * Create or edit an option group in a bottom sheet (UI_SPEC A.17a). A new group is saved first;
 * the choices are added in the same sheet afterwards. Mount it with a fresh `key` each time it
 * opens so the fields start from the group (or empty).
 */
export function GroupForm({ open, group, storeId, usedBy, onClose, onChanged, onCreated, onDelete }: GroupFormProps) {
  const [name, setName] = useState(group?.name ?? '');
  const [allowMultiple, setAllowMultiple] = useState(group?.allowMultiple ?? false);
  const [required, setRequired] = useState(group?.required ?? true);
  const [nameError, setNameError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const checked = validateOptionName(name);
    if (!checked.ok) {
      setNameError(checked.message);
      return;
    }
    setNameError(undefined);
    setFailure(undefined);
    setSubmitting(true);
    const input = { name: checked.name, allowMultiple, required };
    if (group) {
      const result = await updateGroup(group.id, input);
      setSubmitting(false);
      if (!result.ok) {
        setFailure(result.message);
        return;
      }
      // Saved: close the sheet. Staying open with no sign of change looked like a stuck button.
      await onChanged();
      onClose();
      toast.show('Perubahan disimpan.', 'success');
      return;
    }
    const created = await createGroup(storeId, input);
    setSubmitting(false);
    if (!created.ok) setFailure(created.message);
    else onCreated(created.id);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!submitting}
      title={group ? 'Ubah pilihan menu' : 'Tambah pilihan menu'}
      description={group ? undefined : 'Contoh: Level, Bagian ayam, Nasi, Tambahan. Isi pilihannya setelah disimpan.'}
      actions={
        <>
          <Button type="submit" form={FORM_ID} disabled={submitting}>
            {submitting ? 'MENYIMPAN…' : group ? 'SIMPAN PERUBAHAN' : 'SIMPAN DAN ISI PILIHAN'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {group ? 'TUTUP' : 'BATAL'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {failure && <Alert tone="danger">{failure}</Alert>}
        <Input
          label="Nama"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
          error={nameError}
          maxLength={MAX_OPTION_NAME_LENGTH}
          placeholder="Contoh: Level"
          autoComplete="off"
          data-autofocus={group ? undefined : true}
        />
        <div role="group" aria-label="Cara memilih" className="flex flex-col gap-2">
          <p className="text-body font-medium text-foreground">Cara memilih</p>
          <div className="grid grid-cols-2 gap-2">
            <ToggleButton selected={!allowMultiple} onClick={() => setAllowMultiple(false)}>
              Pilih satu
            </ToggleButton>
            <ToggleButton selected={allowMultiple} onClick={() => setAllowMultiple(true)}>
              Boleh banyak
            </ToggleButton>
          </div>
        </div>
        <Checkbox
          label="Wajib dipilih"
          hint="Kasir harus memilih dulu sebelum menu masuk ke pesanan. Matikan untuk pilihan tambahan."
          checked={required}
          onChange={(event) => setRequired(event.target.checked)}
        />
      </form>

      {group && (
        <>
          <hr className="border-border" />
          <ChoiceEditor group={group} storeId={storeId} onChanged={onChanged} />
          <hr className="border-border" />
          <div className="flex flex-col gap-2">
            <p className="text-body text-muted">
              {usedBy > 0 ? `Dipakai di ${usedBy} menu. ` : 'Belum dipasang di menu mana pun. '}
              Transaksi yang sudah terjadi tidak berubah jika grup ini dihapus.
            </p>
            <Button variant="danger-outline" onClick={() => onDelete(group)}>
              HAPUS GRUP INI
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
