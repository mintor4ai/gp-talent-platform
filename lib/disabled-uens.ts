import { createClient } from "@/lib/supabase/server";

let _cache: string[] | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

export async function getDisabledOrgs(): Promise<string[]> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  const supabase = await createClient();
  const { data } = await supabase
    .from("uens_config")
    .select("organización")
    .eq("activa", false);
  _cache = (data ?? []).map((r: Record<string, unknown>) => r["organización"] as string);
  _cacheTime = now;
  return _cache;
}
