import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionHeading } from "@/components/ui/surface";
import { EmptyState } from "@/components/ui/states";
import type { DocumentSummary } from "@/lib/studio/overview";

const STATUS_TONE: Record<
  string,
  "neutral" | "accent" | "positive" | "danger"
> = {
  READY: "positive",
  PROCESSING: "accent",
  UPLOADED: "neutral",
  FAILED: "danger",
};

export function DocumentList({ documents }: { documents: DocumentSummary[] }) {
  if (documents.length === 0) {
    return (
      <EmptyState
        title="No material yet"
        description="Everything Lumen teaches from your own sources will appear here, with page counts and readiness."
      />
    );
  }

  return (
    <Panel inset>
      <SectionHeading
        title="Your material"
        hint={`${documents.length} document${documents.length === 1 ? "" : "s"}`}
      />
      <ul className="mt-4 flex flex-col divide-y divide-[var(--color-border)]">
        {documents.map((d) => (
          <li key={d.id} className="flex items-center gap-4 py-3.5">
            <FileIcon />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[var(--color-ink)]">
                {d.title}
              </p>
              <p className="truncate text-[12px] text-[var(--color-ink-muted)]">
                {[
                  d.pageCount ? `${d.pageCount} pages` : null,
                  d.chunkCount ? `${d.chunkCount} chunks` : null,
                  new Date(d.createdAt).toLocaleDateString(),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>
              {d.status.toLowerCase()}
            </Badge>
            {d.status === "READY" ? (
              <LinkButton
                href={`/studio/plan?documentId=${d.id}`}
                variant="secondary"
                size="sm"
              >
                Teach me this
              </LinkButton>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0 text-[var(--color-ink-faint)]"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v4h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
