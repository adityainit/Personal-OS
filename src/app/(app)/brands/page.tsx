import { LeadsPage } from "@/components/leads/leads-page";

export default async function BrandsPage({ searchParams }: PageProps<"/brands">) {
  return <LeadsPage kind="brand" searchParams={await searchParams} />;
}
