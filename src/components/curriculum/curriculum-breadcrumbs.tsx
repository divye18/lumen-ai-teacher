import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Plain breadcrumb trail for the NCERT Curriculum Explorer. Server-rendered
 * (no client interactivity needed) so it works correctly on refresh and
 * direct navigation — the trail is just a list of links derived from real
 * node titles passed in by the current route's page.
 */
export function CurriculumBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--color-ink-muted)]"
    >
      {items.map((item, index) => (
        <span
          key={`${item.label}-${index}`}
          className="flex items-center gap-1.5"
        >
          {index > 0 ? (
            <span aria-hidden className="text-[var(--color-ink-faint)]">
              /
            </span>
          ) : null}
          {item.href ? (
            <Link
              href={item.href}
              className="transition-colors hover:text-[var(--color-ink)] hover:underline"
            >
              {item.label}
            </Link>
          ) : (
            <span
              className="font-medium text-[var(--color-ink)]"
              aria-current="page"
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
