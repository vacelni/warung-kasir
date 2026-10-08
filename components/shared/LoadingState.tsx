import { Spinner } from '@/components/ui/Spinner';

/** Centered spinner with a text label, announced as a status. Never leave a blank screen while loading (A.20). */
export function LoadingState({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 px-2 py-12 text-center text-muted">
      <Spinner size={32} />
      <p className="text-base">{label}</p>
    </div>
  );
}
