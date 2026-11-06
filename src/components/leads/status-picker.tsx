"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setLeadStatusAction } from "@/actions";
import { Select } from "@/components/ui/form";
import { LEAD_STATUSES, STATUS_LABEL } from "@/lib/domain/constants";
import type { LeadStatus } from "@/lib/domain/types";

export function StatusPicker({ id, status }: { id: string; status: LeadStatus }) {
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label="Lead status"
      value={status}
      disabled={pending}
      className="w-auto"
      onChange={(e) => {
        const next = e.target.value as LeadStatus;
        start(async () => {
          const r = await setLeadStatusAction(id, next);
          if (r.ok) {
            toast.success(
              ["won", "lost", "do_not_contact"].includes(next)
                ? `Marked ${STATUS_LABEL[next]} — pending follow-ups stopped`
                : `Status: ${STATUS_LABEL[next]}`,
            );
          } else toast.error(r.error);
        });
      }}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </Select>
  );
}
