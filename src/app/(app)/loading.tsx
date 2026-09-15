import { Card, Skeleton } from "@/components/ui/primitives";

/**
 * Shared loading state for every authenticated route. Mirrors the common page
 * shape -- header, stat row, table -- so the layout does not jump when the real
 * content arrives.
 */
export default function Loading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-28" />
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>

      <span className="sr-only" role="status">
        Loading
      </span>
    </div>
  );
}
