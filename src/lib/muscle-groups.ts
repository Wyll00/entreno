export const MUSCLE_GROUPS = [
  "Pecho",
  "Espalda",
  "Piernas",
  "Hombros",
  "Bíceps",
  "Tríceps",
  "Antebrazo",
  "Core",
  "Otros",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
