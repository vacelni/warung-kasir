import { StatePanel, type StatePanelProps } from './StatePanel';

/** What failed, what it means, and what the user can do (UI_SPEC A.21). Announced to screen readers. */
export function ErrorState(props: StatePanelProps) {
  return <StatePanel icon="alert" tone="danger" role="alert" {...props} />;
}
