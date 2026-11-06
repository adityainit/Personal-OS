"use client";

import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-20 max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
      <h2 className="text-base font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted">
        This page couldn&apos;t load. If you just updated the app, make sure the latest database migration has been run in Supabase
        (see README → Supabase setup), then try again.
      </p>
      {error.digest ? <p className="mt-2 font-mono text-[11px] text-muted">Reference: {error.digest}</p> : null}
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
