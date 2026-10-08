import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Primary page action, e.g. an add button. Wraps below the title on narrow screens. */
  action?: ReactNode;
};

/** Page title row used at the top of every app page. Renders the page's single <h1>. */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 md:mb-6">
      <div className="min-w-0 flex-1 basis-48">
        <h1 className="text-page-title font-bold break-words text-foreground">{title}</h1>
        {description && <p className="mt-1 text-body text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
