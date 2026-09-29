import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Breadcrumb trail for the NCERT Curriculum Explorer. Server-rendered (no
 * client interactivity needed) so it works correctly on refresh and direct
 * navigation — the trail is just a list of links derived from real node
 * titles passed in by the current route's page.
 *
 * The CURRENT segment gets the identity accent treatment rather than plain
 * ink — the App Router remounts this on every drill-down (no shared DOM
 * node to morph between pages without converting the route tree into a
 * client layout, out of scope for this milestone), so "selected context
 * feels persistent" is realized as a consistent visual language for "you
 * are here" rather than a literal cross-page element transition.
 */
export function CurriculumBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1.5 text-[length:var(--text-meta)] text-[var(--color-ink-muted)]"
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
              className="font-semibold text-[var(--color-accent)]"
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
