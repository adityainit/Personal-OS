"use server";

import { searchAll } from "@/lib/domain/repo";
import type { LeadStatus } from "@/lib/domain/types";
import { requireUser } from "@/lib/supabase/server";

export interface SearchHit {
  lead_id: string;
  name: string;
  status: LeadStatus;
  matched_on: string;
}

export async function searchAction(q: string): Promise<SearchHit[]> {
  const term = String(q ?? "").slice(0, 100);
  if (term.trim().length < 2) return [];
  const { supabase } = await requireUser();
  try {
    return await searchAll(supabase, term, 12);
  } catch {
    return [];
  }
}
