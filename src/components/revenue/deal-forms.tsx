import { SubmitButton } from "@/components/ui/action-form";
import { DateField } from "@/components/ui/datetime-field";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { DEAL_STATUSES, DEAL_STATUS_LABEL } from "@/lib/domain/constants";
import type { Deal, Lead, Payment } from "@/lib/domain/types";

export function DealFields({
  deal,
  leads,
  fixedLead,
}: {
  deal?: Deal;
  leads?: Pick<Lead, "id" | "name">[];
  fixedLead?: { id: string; name: string };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fixedLead ? (
        <input type="hidden" name="lead_id" value={fixedLead.id} />
      ) : (
        <>
          <Field label="Linked brand (optional)" className="sm:col-span-2">
            <Select name="lead_id" defaultValue={deal?.lead_id ?? ""}>
              <option value="">— None —</option>
              {(leads ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Brand name" hint="Filled from the linked brand if left empty" className="sm:col-span-2">
            <Input name="client_name" defaultValue={deal?.client_name ?? ""} />
          </Field>
        </>
      )}
      <Field label="Campaign *" className="sm:col-span-2">
        <Input name="title" required defaultValue={deal?.title} placeholder="e.g. 2 reels + 3 stories" />
      </Field>
      <Field label="Deal amount (₹) *">
        <Input name="amount" inputMode="decimal" required defaultValue={deal?.amount ?? ""} placeholder="e.g. 15000" />
      </Field>
      <Field label="Status">
        <Select name="status" defaultValue={deal?.status ?? "active"}>
          {DEAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {DEAL_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Expected close / delivery">
        <Input type="date" name="expected_date" defaultValue={deal?.expected_date ?? ""} />
      </Field>
      <Field label="Payment due">
        <Input type="date" name="payment_due_date" defaultValue={deal?.payment_due_date ?? ""} />
      </Field>
      {!deal ? (
        <>
          <Field label="Received now (₹)" hint="Optional first payment">
            <Input name="received_now" inputMode="decimal" placeholder="0" />
          </Field>
          <Field label="Payment date">
            <DateField name="paid_on" />
          </Field>
        </>
      ) : null}
      <Field label="Details" className="sm:col-span-2">
        <Textarea name="details" rows={3} defaultValue={deal?.details ?? ""} placeholder="Deliverables, usage rights, invoice no…" />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>{deal ? "Save deal" : "Add deal"}</SubmitButton>
      </div>
    </div>
  );
}

export function PaymentFields({ payment }: { payment?: Payment }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Amount received (₹) *">
        <Input name="amount" inputMode="decimal" required defaultValue={payment?.amount ?? ""} />
      </Field>
      <Field label="Date *">
        <DateField name="paid_on" required defaultValue={payment?.paid_on} />
      </Field>
      <Field label="Method">
        <Input name="method" defaultValue={payment?.method ?? ""} placeholder="UPI, bank transfer…" />
      </Field>
      <Field label="Note">
        <Input name="note" defaultValue={payment?.note ?? ""} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>{payment ? "Save payment" : "Record payment"}</SubmitButton>
      </div>
    </div>
  );
}
