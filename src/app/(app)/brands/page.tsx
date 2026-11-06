import { LeadsPage } from "@/components/leads/leads-page";

export default async function BrandsPage({ searchParams }: PageProps<"/brands">) {
  return <LeadsPage searchParams={await searchParams} />;
}
