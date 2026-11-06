import type { Metadata } from "next";
import { LeadsPage } from "@/components/leads/leads-page";

export const metadata: Metadata = { title: "Brand Deals" };

export default async function BrandsPage({ searchParams }: PageProps<"/brands">) {
  return <LeadsPage kind="brand" searchParams={await searchParams} />;
}
