import { SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PhoneField } from "@/components/ui/phone-field";
import { LEAD_STATUSES, STATUS_LABEL } from "@/lib/domain/constants";
import { splitPhone } from "@/lib/domain/phone";
import type { Lead, LeadKind } from "@/lib/domain/types";

/** Fields for creating or editing a lead. Wrap in <ActionForm>. */
export function LeadFields({ kind, lead }: { kind: LeadKind; lead?: Lead }) {
  const isBrand = kind === "brand";
  const phone = splitPhone(lead?.phone_e164, lead?.phone_country);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {!lead ? <input type="hidden" name="kind" value={kind} /> : null}

      <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted sm:col-span-2">
        {isBrand ? (
          <>
            <span className="font-medium text-fg">Required:</span> brand name and their Instagram handle (or website). No phone number
            needed — you&apos;ll reach them by DM or email.
          </>
        ) : (
          <>
            <span className="font-medium text-fg">Required:</span> name, phone number with country code, and a website or social profile.
          </>
        )}{" "}
        Email is optional — leave it empty if you can&apos;t find a public one. Never guess contact details.
      </div>

      <Field label={isBrand ? "Brand name *" : "Company / agency name *"} className="sm:col-span-2">
        <Input name="name" required defaultValue={lead?.name} placeholder={isBrand ? "e.g. Notion" : "e.g. Pixel Agency"} />
      </Field>

      {isBrand ? (
        <>
          <Field label="Instagram handle *" hint="Where you'll DM them">
            <Input name="instagram_handle" defaultValue={lead?.instagram_handle ?? ""} placeholder="@brand or instagram.com/brand" />
          </Field>
          <Field label="Website">
            <Input name="website" defaultValue={lead?.website ?? ""} placeholder="brand.com" />
          </Field>
        </>
      ) : (
        <>
          <div className="sm:col-span-2">
            <PhoneField defaultCountry={phone.country} defaultNumber={phone.national} />
          </div>
          <Field label="Website">
            <Input name="website" defaultValue={lead?.website ?? ""} placeholder="example.com" />
          </Field>
          <Field label="Instagram profile">
            <Input name="instagram_handle" defaultValue={lead?.instagram_handle ?? ""} placeholder="@handle or instagram.com/handle" />
          </Field>
        </>
      )}
      <Field label="LinkedIn profile">
        <Input name="linkedin_url" defaultValue={lead?.linkedin_url ?? ""} placeholder="linkedin.com/company/…" />
      </Field>
      <Field label="Industry / niche">
        <Input name="industry" defaultValue={lead?.industry ?? ""} placeholder={isBrand ? "AI tools, EdTech…" : "Web agency, SaaS…"} />
      </Field>

      {!lead ? (
        <>
          <Field label="Contact person">
            <Input name="contact_person" placeholder={isBrand ? "Marketing / partnerships contact" : "Name of who you'll speak to"} />
          </Field>
          <Field label="Email (optional)">
            <Input name="email" type="email" autoComplete="off" placeholder="Only if publicly listed" />
          </Field>
        </>
      ) : null}

      <Field label="Location">
        <Input name="location" defaultValue={lead?.location ?? ""} placeholder="Bengaluru, Remote…" />
      </Field>
      <Field label={isBrand ? "Brand size" : "Company size"}>
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
      <Field label={isBrand ? "Collaboration opportunity" : "Opportunity / their likely needs"} className="sm:col-span-2">
        <Textarea name="opportunity" rows={2} defaultValue={lead?.opportunity ?? ""} />
      </Field>
      <Field label={isBrand ? "Why they'd work with me" : "Why they'd need my skills"} className="sm:col-span-2">
        <Textarea name="why_fit" rows={2} defaultValue={lead?.why_fit ?? ""} />
      </Field>
      <Field label={isBrand ? "Suggested collaboration" : "Service to offer"} className="sm:col-span-2">
        <Input
          name="suggested_service"
          defaultValue={lead?.suggested_service ?? ""}
          placeholder={isBrand ? "Sponsored reel + story set" : "Next.js landing page rebuild"}
        />
      </Field>
      <Field label="Research notes" hint={isBrand ? "Products, audience, marketing, past creator collabs, pain points…" : "What they do, clients, tech stack, problems, what they might need…"} className="sm:col-span-2">
        <Textarea name="research" rows={lead ? 8 : 4} defaultValue={lead?.research ?? ""} />
      </Field>
      {!lead ? (
        <label className="flex items-center gap-2 text-xs text-muted sm:col-span-2">
          <input type="checkbox" name="allow_similar" className="accent-[var(--accent)]" />
          {isBrand
            ? "Add even if a brand with a very similar name exists"
            : "Add even if a lead with the same phone number or a very similar name exists"}
        </label>
      ) : null}
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>{lead ? "Save changes" : "Add lead"}</SubmitButton>
      </div>
    </div>
  );
}
