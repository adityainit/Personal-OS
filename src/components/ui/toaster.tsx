"use client";

import { useTheme } from "next-themes";
import { Toaster } from "sonner";

/** Toasts that follow the app's light/dark theme instead of always rendering light. */
export function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster richColors position="top-right" closeButton theme={resolvedTheme === "dark" ? "dark" : "light"} />;
}
