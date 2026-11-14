import { LeadsPage } from "@/components/leads/leads-page";

export default async function FreelancePage({ searchParams }: PageProps<"/freelance">) {
  return <LeadsPage searchParams={await searchParams} />;
}
