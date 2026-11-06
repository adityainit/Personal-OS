import { Bot, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { requireUser } from "@/lib/supabase/server";

async function decide(formData: FormData) {
  "use server";
  const id = String(formData.get("authorization_id") ?? "");
  const decision = formData.get("decision");
  const { supabase } = await requireUser();
  const res =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (res.error || !res.data?.redirect_url) {
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=1`);
  }
  redirect(res.data.redirect_url);
}

/**
 * Consent screen for Supabase Auth's OAuth 2.1 server. Claude.ai lands here
 * (after login) when Aditya adds the CRM as a custom connector.
 */
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const sp = await searchParams;
  const id = typeof sp.authorization_id === "string" ? sp.authorization_id : "";
  const { supabase, user } = await requireUser();

  if (!id) {
    return <Shell><p className="text-sm text-danger">Missing authorization request.</p></Shell>;
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) {
    return (
      <Shell>
        <p className="text-sm text-danger">This authorization request is invalid or has expired. Start the connection again from Claude.</p>
      </Shell>
    );
  }
  if ("redirect_url" in data && !("authorization_id" in data)) redirect(data.redirect_url);
  const details = data as Extract<typeof data, { authorization_id: string }>;
  const scopes = details.scope ? details.scope.split(" ").filter(Boolean) : [];

  return (
    <Shell>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Bot className="size-5" />
        </span>
        <div>
          <h1 className="text-base font-semibold">{details.client.name || "An application"} wants access</h1>
          <p className="text-xs text-muted">to your Personal OS as {user.email}</p>
        </div>
      </div>
      {sp.error ? <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">Something went wrong. Try again.</p> : null}
      <ul className="mb-5 flex flex-col gap-2 text-sm">
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" /> Read and update your brand deals, follow-ups and revenue</li>
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" /> Save research and outreach drafts</li>
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" /> It cannot send messages, delete records, or access other accounts</li>
      </ul>
      <p className="mb-5 text-[11px] text-muted">
        Redirects to <span className="break-all font-mono">{details.redirect_uri}</span>
        {scopes.length ? <> · scopes: {scopes.join(", ")}</> : null}
      </p>
      <form action={decide} className="flex gap-2">
        <input type="hidden" name="authorization_id" value={details.authorization_id} />
        <button name="decision" value="deny" className={buttonClass("secondary", "md", "flex-1 justify-center")}>
          Deny
        </button>
        <button name="decision" value="approve" className={buttonClass("primary", "md", "flex-1 justify-center")}>
          Allow access
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>
    </main>
  );
}
