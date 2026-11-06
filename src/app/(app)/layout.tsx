import { LogOut } from "lucide-react";
import { signOutAction } from "@/actions";
import { MobileNav, Sidebar } from "@/components/shell/nav";
import { NotificationBell, type NotificationItem } from "@/components/shell/notifications";
import { GlobalSearch } from "@/components/shell/search";
import { ThemeToggle } from "@/components/ui/misc";
import { findLogoSrc } from "@/lib/brand";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user } = await requireUser();
  const logoSrc = findLogoSrc();

  const [{ data: notes }, { count: dueCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, read_at, created_at, activity:activities(type, summary, lead_id, actor)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("due_at", new Date().toISOString()),
  ]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar dueCount={dueCount ?? 0} logoSrc={logoSrc} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-3 backdrop-blur sm:px-6">
          <MobileNav dueCount={dueCount ?? 0} logoSrc={logoSrc} />
          <div className="flex min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <NotificationBell items={(notes ?? []) as unknown as NotificationItem[]} />
          <ThemeToggle />
          <form action={signOutAction}>
            <button
              type="submit"
              title={`Sign out ${user.email ?? ""}`}
              aria-label="Sign out"
              className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-2"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
