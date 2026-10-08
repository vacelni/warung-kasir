import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from '@/components/ui/Icon';
import { TONE_CLASSES, type Tone } from '@/components/ui/tones';

export type StatePanelProps = {
  title: string;
  description?: string;
  /** Buttons or links below the text. Give each one `className="w-full"` on phones. */
  actions?: ReactNode;
  /** Heading level for the title; use 1 when the panel is the whole page. */
  headingLevel?: 1 | 2 | 3;
};

type BaseProps = StatePanelProps & { icon: IconName; tone: Tone; role?: 'status' | 'alert' };

/**
 * Centered icon, title, text, and actions. Shared base of EmptyState, ErrorState, and SuccessState
 * so every empty/error/success screen has the same structure (UI_SPEC A.21).
 */
export function StatePanel({ icon, tone, title, description, actions, headingLevel = 2, role }: BaseProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section role={role} className="mx-auto flex w-full max-w-sm flex-col items-center gap-3 px-2 py-8 text-center">
      <span className={cx('flex h-14 w-14 items-center justify-center rounded-full border', TONE_CLASSES[tone])}>
        <Icon name={icon} size={28} />
      </span>
      <Heading className="text-section-title font-semibold break-words text-foreground">{title}</Heading>
      {description && <p className="text-base text-muted">{description}</p>}
      {actions && <div className="mt-2 flex w-full flex-col gap-3">{actions}</div>}
    </section>
  );
}
