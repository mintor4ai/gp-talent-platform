const BUCKET = "fotos-empleados";

/**
 * Returns the public URL for an employee's photo.
 * Falls back to null if the env var is missing (SSR-safe).
 */
/** Pass the employee's `id_empleado` (numeric string), NOT the UUID. */
export function getFotoUrl(idEmpleado: string | null | undefined, ext: "jpg" | "png" | "webp" = "jpg"): string | null {
  if (!idEmpleado) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/${idEmpleado}.${ext}`;
}
