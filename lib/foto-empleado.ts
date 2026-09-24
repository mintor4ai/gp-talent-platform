const BUCKET = "fotos-empleados";

/**
 * Returns the public URL for an employee's photo.
 * Falls back to null if the env var is missing (SSR-safe).
 */
export function getFotoUrl(id: string | null | undefined, ext: "jpg" | "png" | "webp" = "jpg"): string | null {
  if (!id) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/${id}.${ext}`;
}
