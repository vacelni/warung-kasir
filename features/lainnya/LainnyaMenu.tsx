'use client';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { InfoRow, LinkRow } from '@/components/ui/LinkRow';
import { ABOUT_ITEM, lainnyaManagementItems } from '@/components/layout/navigation';
import { LogoutButton } from '@/features/auth/LogoutButton';
import { useProfile } from '@/features/auth/AuthProvider';
import { ROLE_LABELS } from '@/lib/permissions';

/** Contents of the Lainnya page per role (UI_SPEC A.7). */
export function LainnyaMenu() {
  const profile = useProfile();
  const initial = Array.from(profile.name.trim())[0]?.toUpperCase() ?? '?';

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Card className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-section-title font-bold text-primary-ink"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold break-words text-foreground">{profile.name}</p>
          <Badge tone="neutral" className="mt-1">
            {ROLE_LABELS[profile.role]}
          </Badge>
        </div>
      </Card>

      <Card padded={false} className="divide-y divide-border overflow-hidden">
        {lainnyaManagementItems(profile.role).map((item) => (
          <LinkRow key={item.href} href={item.href} label={item.label} icon={item.icon} />
        ))}
        {/* The pending/failed counts arrive with the outbox and sync. */}
        <InfoRow label="Status sinkronisasi" icon="sync">
          <Badge tone="neutral">Segera hadir</Badge>
        </InfoRow>
        <LinkRow href={ABOUT_ITEM.href} label={ABOUT_ITEM.label} icon={ABOUT_ITEM.icon} />
      </Card>

      {/* Kept apart from the navigation rows so it is never tapped by accident (UI_SPEC A.6). */}
      <LogoutButton className="mt-4 w-full" />
    </div>
  );
}
