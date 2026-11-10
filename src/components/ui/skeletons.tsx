/**
 * Placeholders shown the instant you click a tab (via each route's loading.tsx) while
 * the server fetches the real page. They roughly match each page's shape.
 */
const bar = "rounded-lg bg-surface-2";

function Header() {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <div className={`h-7 w-56 ${bar}`} />
        <div className={`h-4 w-80 max-w-full ${bar}`} />
      </div>
      <div className={`hidden h-9 w-28 sm:block ${bar}`} />
    </div>
  );
}

export function ListSkeleton({ strip = false, rows = 8 }: { strip?: boolean; rows?: number }) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <Header />
      {strip ? (
        <div className="mb-4 rounded-xl border border-border p-3">
          <div className={`mb-3 h-4 w-48 ${bar}`} />
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={`h-16 w-20 shrink-0 ${bar}`} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="rounded-xl border border-border">
        <div className="flex gap-2 border-b border-border p-3">
          <div className={`h-9 flex-1 ${bar}`} />
          <div className={`h-9 w-28 ${bar}`} />
          <div className={`h-9 w-28 ${bar}`} />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
            <div className={`h-4 w-40 ${bar}`} />
            <div className={`h-4 flex-1 ${bar}`} />
            <div className={`h-5 w-20 rounded-full bg-surface-2`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <Header />
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="h-72 rounded-xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
