export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-6 h-7 w-56 rounded-lg bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-surface-2" />
        ))}
      </div>
      <div className="mt-6 h-80 rounded-xl bg-surface-2" />
    </div>
  );
}
