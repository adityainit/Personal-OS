"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export const APP_NAME = "Personal OS";

/**
 * The Personal OS logo: the same artwork as the favicon (src/app/icon.svg).
 * Keep the two in sync if you change the design.
 */
export function LogoGlyph({ size = 36, className }: { size?: number; className?: string }) {
  const gid = `pos-g-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0 drop-shadow-sm", className)}
      role="img"
      aria-label={`${APP_NAME} logo`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gid})`} />
      <path
        d="M22 48V16h12a10 10 0 0 1 0 20H22"
        fill="none"
        stroke="#fff"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="44.5" cy="46.5" r="4.5" fill="#22d3ee" />
    </svg>
  );
}

/**
 * The owner's profile photo as a round avatar (sidebar). `src` comes from the server and is
 * null until a photo exists in /public; without one, the Personal OS logo is shown instead.
 */
export function LogoMark({ src, size = 36, className }: { src?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <LogoGlyph size={size} className={className} />;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full shadow-sm ring-2 ring-surface outline outline-1 outline-border",
        className,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Profile photo"
    >
      <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" onError={() => setFailed(true)} priority={size >= 56} />
    </span>
  );
}
