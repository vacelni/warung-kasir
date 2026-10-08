'use client';

import { useState, type ComponentProps } from 'react';
import { Icon } from './Icon';
import { Input } from './Input';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'trailing'>;

/** Password field with a 48px show/hide toggle, so the value can be checked on a phone keyboard. */
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
          aria-pressed={visible}
          className="flex h-12 w-12 items-center justify-center rounded-r-control text-muted"
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={22} />
        </button>
      }
    />
  );
}
