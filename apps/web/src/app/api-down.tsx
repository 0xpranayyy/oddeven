export function ApiDown() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Can't reach the exchange</h1>
      <p className="mt-2 text-sm text-muted">
        Start the API with <code className="rounded bg-surface-2 px-1.5 py-0.5">pnpm dev</code> from the repo
        root.
      </p>
    </div>
  );
}
