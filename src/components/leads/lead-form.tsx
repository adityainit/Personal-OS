import { SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { LEAD_STATUSES, STATUS_LABEL } from "@/lib/domain/constants";
import type { Lead } from "@/lib/domain/types";

/** Fields for creating or editing a brand lead. Wrap in <ActionForm>. */
export function LeadFields({ lead }: { lead?: Lead }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted sm:col-span-2">
        <span className="font-medium text-fg">Required:</span> brand name and their Instagram handle (or website). You&apos;ll reach
        them by DM or email. Email is optional — leave it empty if you can&apos;t find a public one. Never guess contact details.
      </div>

      <Field label="Brand name *" className="sm:col-span-2">
        <Input name="name" required defaultValue={lead?.name} placeholder="e.g. Notion" />
      </Field>

      <Field label="Instagram handle *" hint="Where you'll DM them">
        <Input name="instagram_handle" defaultValue={lead?.instagram_handle ?? ""} placeholder="@brand or instagram.com/brand" />
      </Field>
      <Field label="Website">
        <Input name="website" defaultValue={lead?.website ?? ""} placeholder="brand.com" />
      </Field>
      <Field label="LinkedIn profile">
        <Input name="linkedin_url" defaultValue={lead?.linkedin_url ?? ""} placeholder="linkedin.com/company/…" />
      </Field>
      <Field label="Industry / niche">
        <Input name="industry" defaultValue={lead?.industry ?? ""} placeholder="AI tools, EdTech…" />
      </Field>

      {!lead ? (
        <>
          <Field label="Contact person">
            <Input name="contact_person" placeholder="Marketing / partnerships contact" />
          </Field>
          <Field label="Email (optional)">
            <Input name="email" type="email" autoComplete="off" placeholder="Only if publicly listed" />
          </Field>
        </>
      ) : null}

      <Field label="Location">
        <Input name="location" defaultValue={lead?.location ?? ""} placeholder="Bengaluru, Remote…" />
      </Field>
      <Field label="Brand size">
        <Input name="company_size" defaultValue={lead?.company_size ?? ""} placeholder="e.g. 11–50" />
      </Field>
      <Field label="Fit score (0–100)">
        <Input name="fit_score" type="number" min={0} max={100} defaultValue={lead?.fit_score ?? ""} />
      </Field>
      {lead ? (
        <Field label="Status">
          <Select name="status" defaultValue={lead.status}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Tags" hint="Comma separated" className={lead ? "" : "sm:col-span-2"}>
        <Input name="tags" defaultValue={lead?.tags.join(", ") ?? ""} placeholder="ai, devtools, priority" />
      </Field>
      <Field label="Business description" className="sm:col-span-2">
        <Textarea name="description" rows={2} defaultValue={lead?.description ?? ""} placeholder="What they do" />
      </Field>
      <Field label="Collaboration opportunity" className="sm:col-span-2">
        <Textarea name="opportunity" rows={2} defaultValue={lead?.opportunity ?? ""} />
      </Field>
      <Field label="Why they'd work with me" className="sm:col-span-2">
        <Textarea name="why_fit" rows={2} defaultValue={lead?.why_fit ?? ""} />
      </Field>
      <Field label="Suggested collaboration" className="sm:col-span-2">
        <Input
          name="suggested_service"
          defaultValue={lead?.suggested_service ?? ""}
          placeholder="Sponsored reel + story set"
        />
      </Field>
      <Field label="Research notes" hint="Products, audience, marketing, past creator collabs, pain points…" className="sm:col-span-2">
        <Textarea name="research" rows={lead ? 8 : 4} defaultValue={lead?.research ?? ""} />
      </Field>
      {!lead ? (
        <label className="flex items-center gap-2 text-xs text-muted sm:col-span-2">
          <input type="checkbox" name="allow_similar" className="accent-[var(--accent)]" />
          Add even if a brand with a very similar name exists
        </label>
      ) : null}
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>{lead ? "Save changes" : "Add brand"}</SubmitButton>
      </div>
    </div>
  );
}
