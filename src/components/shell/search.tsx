"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchAction, type SearchHit } from "@/actions/search";
import { StatusBadge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** Global search (Ctrl/⌘ + K) over leads and contacts. */
export function GlobalSearch() {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();

  const open = () => {
    ref.current?.showModal();
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      start(async () => {
        setHits(await searchAction(term));
        setActive(0);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (h: SearchHit) => {
    ref.current?.close();
    setQ("");
    router.push(`/leads/${h.lead_id}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted transition hover:border-ring/50"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left">Search clients, emails…</span>
        <kbd className="hidden rounded border border-border px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      <dialog
        ref={ref}
        className="mx-auto mt-[12vh] w-[calc(100%-1.5rem)] max-w-xl rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && hits[active]) {
                go(hits[active]);
              }
            }}
            placeholder="Search by name, website, @handle, email, tag…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            aria-label="Search"
          />
          {pending ? <Spinner /> : null}
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {hits.map((h, i) => (
            <li key={h.lead_id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                  i === active ? "bg-surface-2" : "",
                )}
              >
                <span className="flex-1 truncate font-medium">{h.name}</span>
                <span className="text-[11px] text-muted">
                  matched on {h.matched_on}
                </span>
                <StatusBadge status={h.status} />
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && !pending && hits.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted">No matches</li>
          ) : null}
          {q.trim().length < 2 ? (
            <li className="px-3 py-6 text-center text-xs text-muted">Type at least 2 characters</li>
          ) : null}
        </ul>
      </dialog>
    </>
  );
}
