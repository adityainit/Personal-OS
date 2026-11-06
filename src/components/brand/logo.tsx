"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const APP_NAME = "Personal OS";

/**
 * The owner's profile photo as a round logo. `src` comes from the server (it is null until
 * a photo exists in /public), so no failing image requests are made. Falls back to a
 * neutral initial, and never shows an unrelated image.
 */
export function LogoMark({ src, size = 36, className }: { src?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!src && !failed;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-accent-fg shadow-sm ring-2 ring-surface outline outline-1 outline-border",
        className,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${APP_NAME} logo`}
    >
      {showPhoto ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
          onError={() => setFailed(true)}
          priority={size >= 56}
        />
      ) : (
        <span className="font-semibold" style={{ fontSize: size * 0.42 }} aria-hidden>
          A
        </span>
      )}
    </span>
  );
}
