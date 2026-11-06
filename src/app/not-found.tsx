import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-muted">404</p>
      <h1 className="text-xl font-semibold">This page doesn&apos;t exist</h1>
      <ButtonLink href="/dashboard" variant="secondary">
        Back to dashboard
      </ButtonLink>
    </main>
  );
}
