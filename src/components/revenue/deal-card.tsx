import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  deleteDealAction,
  deletePaymentAction,
  recordPaymentAction,
  setDealStatusAction,
  updateDealAction,
} from "@/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { ActionButton } from "@/components/ui/misc";
import type { DealWithPayments } from "@/lib/domain/repo";
import type { Lead } from "@/lib/domain/types";
import { cn, fmtDate, money } from "@/lib/utils";
import { DealFields, PaymentFields } from "./deal-forms";

const STATUS_TONE = {
  active: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  won: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  lost: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

export function DealCard({
  deal,
  leads,
  showClient = true,
}: {
  deal: DealWithPayments;
  leads?: Pick<Lead, "id" | "name">[];
  showClient?: boolean;
}) {
  const received = deal.payments.reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = Math.max(Number(deal.amount) - received, 0);
  const pct = Number(deal.amount) > 0 ? Math.min((received / Number(deal.amount)) * 100, 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{deal.title}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", STATUS_TONE[deal.status])}>
              {deal.status}
            </span>
          </div>
          {showClient ? (
            <p className="mt-0.5 text-xs text-muted">
              {deal.lead_id ? (
                <Link href={`/leads/${deal.lead_id}`} className="hover:text-accent hover:underline">
                  {deal.client_name}
                </Link>
              ) : (
                deal.client_name
              )}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {deal.status === "active" ? (
            <ActionButton action={setDealStatusAction.bind(null, deal.id, "won")} variant="subtle">
              Mark won
            </ActionButton>
          ) : null}
          {deal.status === "active" ? (
            <ActionButton action={setDealStatusAction.bind(null, deal.id, "lost")} variant="ghost">
              Lost
            </ActionButton>
          ) : (
            <ActionButton action={setDealStatusAction.bind(null, deal.id, "active")} variant="ghost">
              Reopen
            </ActionButton>
          )}
          <Dialog trigger={<Pencil />} triggerTitle="Edit deal" title="Edit deal" variant="ghost" size="icon-sm" wide>
            <ActionForm action={updateDealAction.bind(null, deal.id)} reset={false}>
              <DealFields
                deal={deal}
                leads={leads}
                fixedLead={!leads && deal.lead_id ? { id: deal.lead_id, name: deal.client_name } : undefined}
              />
            </ActionForm>
          </Dialog>
          <ActionButton action={deleteDealAction.bind(null, deal.id)} confirm="Delete?" variant="ghost" size="icon-sm" title="Delete deal">
            <Trash2 />
          </ActionButton>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-[11px] text-muted">Deal</p>
          <p className="font-semibold tabular-nums">{money(deal.amount)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">Received</p>
          <p className="font-semibold tabular-nums text-success">{money(received)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">{deal.status === "won" ? "Pending" : "Outstanding"}</p>
          <p className={cn("font-semibold tabular-nums", outstanding > 0 && deal.status === "won" && "text-warning")}>
            {money(outstanding)}
          </p>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {deal.expected_date ? `Expected ${fmtDate(deal.expected_date)} · ` : ""}
        {deal.payment_due_date ? `Payment due ${fmtDate(deal.payment_due_date)} · ` : ""}
        Created {fmtDate(deal.created_at)}
      </p>
      {deal.details ? <p className="prose-text mt-2 text-xs text-muted">{deal.details}</p> : null}

      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium">Payments</p>
          <Dialog trigger={<><Plus /> Payment</>} title="Record payment" description={deal.title} variant="secondary" size="sm">
            <ActionForm action={recordPaymentAction.bind(null, deal.id)}>
              <PaymentFields />
            </ActionForm>
          </Dialog>
        </div>
        {deal.payments.length === 0 ? (
          <p className="text-[11px] text-muted">No payments recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {[...deal.payments]
              .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="tabular-nums">
                    <span className="font-medium">{money(p.amount)}</span>
                    <span className="text-muted">
                      {" "}
                      · {fmtDate(p.paid_on)}
                      {p.method ? ` · ${p.method}` : ""}
                      {p.note ? ` · ${p.note}` : ""}
                    </span>
                  </span>
                  <ActionButton
                    action={deletePaymentAction.bind(null, p.id)}
                    confirm="Remove?"
                    variant="ghost"
                    size="icon-sm"
                    title="Remove payment"
                  >
                    <Trash2 />
                  </ActionButton>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
