import { StatePanel, type StatePanelProps } from './StatePanel';

/** Confirmation that an action completed. Announced politely to screen readers. */
export function SuccessState(props: StatePanelProps) {
  return <StatePanel icon="check" tone="success" role="status" {...props} />;
}
