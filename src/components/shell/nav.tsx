"use client";

import {
  Activity,
  Bot,
  Briefcase,
  CalendarClock,
  ChartColumn,
  IndianRupee,
  LayoutDashboard,
  Menu,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { InstagramIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/brands", label: "Brand Deals", icon: InstagramIcon },
  { href: "/freelance", label: "Freelancing", icon: Briefcase },
  { href: "/follow-ups", label: "Follow-ups", icon: CalendarClock, badge: "followUps" as const },
  { href: "/revenue", label: "Revenue", icon: IndianRupee },
  { href: "/reports", label: "Reports", icon: ChartColumn },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/assistant", label: "Claude Assistant", icon: Bot },
];

function NavLinks({ dueCount, onNavigate }: { dueCount: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + "/") ||
    (href === "/brands" && pathname.startsWith("/leads/") && pathname.includes("kind=brand"));
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon, badge }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
            isActive(href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span className="flex-1">{label}</span>
          {badge === "followUps" && dueCount > 0 ? (
            <span className="rounded-full bg-danger px-1.5 text-[10px] font-semibold leading-4 text-danger-fg">{dueCount}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

function Brand({ logoSrc }: { logoSrc: string | null }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-3">
      <LogoMark src={logoSrc} size={36} />
      <span className="leading-tight">
        <span className="block text-sm font-semibold">Personal OS</span>
        <span className="block text-[11px] text-muted">Aditya</span>
      </span>
    </Link>
  );
}

function SettingsLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <Link
      href="/settings"
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
        pathname.startsWith("/settings") ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Settings className="size-4" /> Settings
    </Link>
  );
}

export function Sidebar({ dueCount, logoSrc }: { dueCount: number; logoSrc: string | null }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface px-3 py-5 lg:flex">
      <Brand logoSrc={logoSrc} />
      <div className="flex-1 overflow-y-auto">
        <NavLinks dueCount={dueCount} />
      </div>
      <SettingsLink />
    </aside>
  );
}

export function MobileNav({ dueCount, logoSrc }: { dueCount: number; logoSrc: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        className="relative inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-2 lg:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
        {dueCount > 0 ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger" /> : null}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 bg-surface px-3 py-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Brand logoSrc={logoSrc} />
              <button
                type="button"
                aria-label="Close menu"
                className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-2"
                onClick={() => setOpen(false)}
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks dueCount={dueCount} onNavigate={() => setOpen(false)} />
            </div>
            <SettingsLink onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
