import { AlertTriangle, Bot, ExternalLink, Phone, Trash2 } from "lucide-react";
import { deleteProspectAction, promoteProspectAction } from "@/actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FitScore } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ActionButton } from "@/components/ui/misc";
import { PhoneField } from "@/components/ui/phone-field";
import type { IncompleteProspect } from "@/lib/domain/types";
import { externalUrl, relative } from "@/lib/utils";

/**
 * Researched businesses with no verified phone number. They are kept out of the
 * pipeline until a valid phone number is added.
 */
export function ProspectsPanel({ prospects }: { prospects: IncompleteProspect[] }) {
  if (prospects.length === 0) return null;
  return (
    <Card className="mb-4 border-warning/40">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" /> Incomplete prospects ({prospects.length})
          </span>
        }
        description="Researched, but no verified phone number. They are not leads yet — add a phone number to promote one."
      />
      <ul className="divide-y divide-border">
        {prospects.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {p.name}
                {p.source === "claude" ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-normal text-accent">
                    <Bot className="size-3" /> Claude
                  </span>
                ) : null}
                <FitScore score={p.fit_score} />
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted">
                {p.website ? (
                  <a href={externalUrl(p.website)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                    <ExternalLink className="size-3" /> {p.domain_normalized}
                  </a>
                ) : null}
                <span className="text-warning">{p.missing}</span>
                <span>{relative(p.created_at)}</span>
              </p>
              {p.suggested_service || p.opportunity ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted">{p.suggested_service ?? p.opportunity}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <Dialog trigger={<><Phone /> Add phone</>} title={`Add phone for ${p.name}`} description="Saves it as a lead with all its research." size="sm">
                <ActionForm action={promoteProspectAction.bind(null, p.id)}>
                  <div className="flex flex-col gap-4">
                    <PhoneField />
                    <div className="flex justify-end">
                      <SubmitButton>Save as lead</SubmitButton>
                    </div>
                  </div>
                </ActionForm>
              </Dialog>
              <ActionButton action={deleteProspectAction.bind(null, p.id)} confirm="Delete?" variant="ghost" size="icon-sm" title="Delete prospect">
                <Trash2 />
              </ActionButton>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
