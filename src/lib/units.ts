// Conversión exacta entre texto en kilos y gramos enteros, sin pasar por coma flotante.

export const WEIGHT_MODES = ["total", "per_dumbbell", "bodyweight"] as const;
export type WeightMode = (typeof WEIGHT_MODES)[number];

export const WEIGHT_MODE_LABELS: Record<WeightMode, string> = {
  total: "Total (barra incluida)",
  per_dumbbell: "Por mancuerna",
  bodyweight: "Peso corporal",
};

export const MAX_WEIGHT_GRAMS = 1_000_000; // 1000 kg

/** "62,5" | "62.5" | 62.5 → 62500. Devuelve null si el formato no es válido. */
export function kgToGrams(value: string | number): number | null {
  const text = String(value).trim().replace(",", ".");
  const match = /^(\d{1,4})(?:\.(\d{1,3}))?$/.exec(text);
  if (!match) return null;
  const grams = Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0"));
  return grams <= MAX_WEIGHT_GRAMS ? grams : null;
}

/** 62500 → "62.5" (punto decimal, formato de intercambio). */
export function gramsToKg(grams: number): string {
  const whole = Math.floor(grams / 1000);
  const fraction = String(grams % 1000).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** "62.5" → "62,5" para mostrar. */
export function displayKg(kg: string): string {
  return kg.replace(".", ",");
}
