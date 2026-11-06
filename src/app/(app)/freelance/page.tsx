import type { Metadata } from "next";
import { LeadsPage } from "@/components/leads/leads-page";

export const metadata: Metadata = { title: "Freelancing" };

export default async function FreelancePage({ searchParams }: PageProps<"/freelance">) {
  return <LeadsPage kind="freelance" searchParams={await searchParams} />;
}
