import { SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PhoneField } from "@/components/ui/phone-field";
import { LEAD_STATUSES, STATUS_LABEL } from "@/lib/domain/constants";
import { splitPhone } from "@/lib/domain/phone";
import type { Lead } from "@/lib/domain/types";

const COPY = {
  name: "Business name *",
  namePlaceholder: "e.g. Sharma Dental Clinic",
  size: "Business size",
  opportunity: "What they need",
  suggested: "Service to offer",
  suggestedPlaceholder: "Website redesign, landing page, automation…",
  research: "What they do, their current website/online presence, problems you could fix…",
  similar: "Add even if a client with a very similar name exists",
  add: "Add client",
} as const;

/** Fields for creating or editing a freelance client. Wrap in <ActionForm>. */
export function LeadFields({ lead }: { lead?: Lead }) {
  const c = COPY;
  const phone = splitPhone(lead?.phone_e164, lead?.phone_country);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted sm:col-span-2">
        <span className="font-medium text-fg">Required:</span> business name and their phone number with country code.
        You&apos;ll reach them on WhatsApp or by email. Instagram and email are optional. Never guess contact details.
      </div>

      <Field label={c.name} className="sm:col-span-2">
        <Input name="name" required defaultValue={lead?.name} placeholder={c.namePlaceholder} />
      </Field>

      <div className="sm:col-span-2">
        <PhoneField
          label="Phone number (WhatsApp)"
          required
          defaultCountry={phone.country}
          defaultNumber={phone.national}
        />
      </div>

      <Field label="Business Instagram" hint="Optional — only if they have one">
        <Input name="instagram_handle" defaultValue={lead?.instagram_handle ?? ""} placeholder="@business or instagram.com/business" />
      </Field>
      <Field label="Website">
        <Input name="website" defaultValue={lead?.website ?? ""} placeholder="business.com" />
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
            <Input name="contact_person" placeholder="Owner / manager" />
          </Field>
          <Field label="Email (optional)">
            <Input name="email" type="email" autoComplete="off" placeholder="Only if publicly listed" />
          </Field>
        </>
      ) : null}

      <Field label="Location">
        <Input name="location" defaultValue={lead?.location ?? ""} placeholder="Bengaluru, Remote…" />
      </Field>
      <Field label={c.size}>
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
      <Field label={c.opportunity} className="sm:col-span-2">
        <Textarea name="opportunity" rows={2} defaultValue={lead?.opportunity ?? ""} />
      </Field>
      <Field label="Why I'm a good fit" className="sm:col-span-2">
        <Textarea name="why_fit" rows={2} defaultValue={lead?.why_fit ?? ""} />
      </Field>
      <Field label={c.suggested} className="sm:col-span-2">
        <Input name="suggested_service" defaultValue={lead?.suggested_service ?? ""} placeholder={c.suggestedPlaceholder} />
      </Field>
      <Field label="Research notes" hint={c.research} className="sm:col-span-2">
        <Textarea name="research" rows={lead ? 8 : 4} defaultValue={lead?.research ?? ""} />
      </Field>
      {!lead ? (
        <label className="flex items-center gap-2 text-xs text-muted sm:col-span-2">
          <input type="checkbox" name="allow_similar" className="accent-[var(--accent)]" />
          {c.similar}
        </label>
      ) : null}
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>{lead ? "Save changes" : c.add}</SubmitButton>
      </div>
    </div>
  );
}
