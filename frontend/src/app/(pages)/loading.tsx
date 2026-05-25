export default function PageLoading() {
  return (
    <div className="flex-1 p-6 space-y-4 animate-pulse">
      {/* Page header skeleton */}
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 rounded-md" style={{ background: "var(--color-border)" }} />
        <div className="h-6 w-48 rounded-lg" style={{ background: "var(--color-border)" }} />
      </div>
      <div className="h-4 w-72 rounded" style={{ background: "var(--color-border)" }} />

      {/* Table card skeleton */}
      <div className="rounded-2xl overflow-hidden mt-4" style={{ background: "var(--color-surface)" }}>
        {/* Toolbar row */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div className="h-8 w-32 rounded-lg" style={{ background: "var(--color-surface-2)" }} />
          <div className="h-8 w-64 rounded-lg" style={{ background: "var(--color-surface-2)" }} />
        </div>

        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="w-4 h-4 rounded" style={{ background: "var(--color-surface-2)" }} />
            <div className="flex-1 h-4 rounded" style={{ background: "var(--color-surface-2)" }} />
            <div className="w-24 h-4 rounded" style={{ background: "var(--color-surface-2)" }} />
            <div className="w-16 h-5 rounded-full" style={{ background: "var(--color-surface-2)" }} />
            <div className="w-20 h-4 rounded" style={{ background: "var(--color-surface-2)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
