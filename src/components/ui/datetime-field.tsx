"use client";

import { useEffect, useState } from "react";
import { Input } from "./form";

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Local date-time picker that submits an ISO timestamp with the browser's
 * timezone, so the server (UTC) stores the moment the user actually meant.
 */
export function DateTimeField({
  name,
  defaultDaysFromNow,
  defaultValue,
  required,
  hour = 10,
}: {
  name: string;
  defaultDaysFromNow?: number;
  defaultValue?: string | null;
  required?: boolean;
  hour?: number;
}) {
  const [local, setLocal] = useState("");

  useEffect(() => {
    let d: Date | null = null;
    if (defaultValue) d = new Date(defaultValue);
    else if (defaultDaysFromNow !== undefined) {
      d = new Date();
      d.setDate(d.getDate() + defaultDaysFromNow);
      d.setHours(hour, 0, 0, 0);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (d) setLocal(toLocalInput(d));
  }, [defaultValue, defaultDaysFromNow, hour]);

  const iso = local ? new Date(local).toISOString() : "";
  return (
    <>
      <Input type="datetime-local" value={local} required={required} onChange={(e) => setLocal(e.target.value)} />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}

/** Today's date (YYYY-MM-DD) in the browser's timezone. */
export function DateField({ name, defaultValue, required }: { name: string; defaultValue?: string | null; required?: boolean }) {
  const [v, setV] = useState(defaultValue ?? "");
  useEffect(() => {
    if (!defaultValue) {
      const d = new Date();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setV(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
  }, [defaultValue]);
  return <Input type="date" name={name} value={v} required={required} onChange={(e) => setV(e.target.value)} />;
}
