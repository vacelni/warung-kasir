import type { IconName } from '@/components/ui/Icon';
import { StatePanel, type StatePanelProps } from './StatePanel';

/** "Nothing here yet": say what is missing and what to do about it. */
export function EmptyState({ icon = 'inbox', ...props }: StatePanelProps & { icon?: IconName }) {
  return <StatePanel icon={icon} tone="neutral" {...props} />;
}
