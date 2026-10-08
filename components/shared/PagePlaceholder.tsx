import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';

/** Stand-in for a page whose feature is built in a later phase. Remove per page as it is implemented. */
export function PagePlaceholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        title="Segera hadir"
        description={`Halaman ${title.toLowerCase()} sedang disiapkan.`}
      />
    </>
  );
}
