import { Skeleton } from "@/components/ui/skeleton";

export default function CurriculumLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Skeleton className="h-4 w-48" />
      <div>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />
        ))}
      </div>
    </div>
  );
}
