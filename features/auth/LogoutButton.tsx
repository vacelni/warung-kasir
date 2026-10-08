'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from './AuthProvider';

/**
 * Signs this device out. The blocking pending-transaction warning (UI_SPEC A.24) is added with
 * the outbox; until then there is nothing local to lose.
 */
export function LogoutButton({ className }: { className?: string }) {
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await logout();
    } catch (error) {
      console.error('Could not sign out:', error);
      setPending(false);
    }
  }

  return (
    <Button variant="danger-outline" onClick={handleClick} disabled={pending} className={className}>
      <Icon name="logout" size={20} />
      Keluar
    </Button>
  );
}
