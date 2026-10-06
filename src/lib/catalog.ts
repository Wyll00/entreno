// Catálogo de ejercicios: 759 de kinetic-place/exercises-db (MIT, ver
// catalog-data/) más una capa propia con las formas habituales de decirlos.
// Se copia a la base de datos de cada usuario (exercises.ts) y desde ahí se
// puede editar o ampliar en la app.
//
// `mode` es la convención de peso por defecto: lo que se entiende al decir
// «60 kilos» sin más. Un alias pertenece a un solo ejercicio; por eso las
// frases genéricas («press inclinado») se asignan a una variante concreta y
// la otra hay que nombrarla entera («press inclinado con mancuernas»).
import kinetic from "./catalog-data/kinetic-es.json" with { type: "json" };
import type { WeightMode } from "./units.ts";

import type { MuscleGroup } from "./muscle-groups.ts";

export { MUSCLE_GROUPS, type MuscleGroup } from "./muscle-groups.ts";

export type CatalogEntry = {
  name: string;
  group: MuscleGroup;
  mode: WeightMode | null;
  aliases: string[];
  /** Ejercicio habitual: sale primero en listas y sugerencias. */
  featured: boolean;
};

/** Súbelo al cambiar el catálogo para que se vuelva a sincronizar. */
export const CATALOG_VERSION = 4;

/**
 * Alias retirados: se borran al sincronizar. Son nombres de músculos que
 * chocaban con «hoy toca tríceps y bíceps» (etiqueta de la sesión, no ejercicios).
 */
export const RETIRED_ALIASES = ["triceps", "biceps", "cuadriceps"];

const T: WeightMode = "total";
const M: WeightMode = "per_dumbbell";
const C: WeightMode = "bodyweight";

type Curated = { name: string; group: MuscleGroup; mode: WeightMode; aliases: string[] };

// Los nombres coinciden con los del repositorio cuando existe el ejercicio.
const CURATED: Curated[] = [
  // Pecho
  { name: "Press de Banca con Barra", group: "Pecho", mode: T, aliases: ["press de banca", "press banca", "banca", "press plano", "press plano con barra", "bench press"] },
  { name: "Press Inclinado con Barra", group: "Pecho", mode: T, aliases: ["press inclinado", "press de banca inclinado"] },
  { name: "Press Declinado con Barra", group: "Pecho", mode: T, aliases: ["press declinado"] },
  { name: "Press de Banca con Mancuerna", group: "Pecho", mode: M, aliases: ["press de banca con mancuernas", "press plano con mancuernas", "press banca con mancuernas", "press de pecho con mancuernas"] },
  { name: "Press Inclinado con Mancuerna", group: "Pecho", mode: M, aliases: ["press inclinado con mancuernas"] },
  { name: "Aperturas con Mancuerna", group: "Pecho", mode: M, aliases: ["aperturas", "aperturas con mancuernas", "aperturas planas", "flyes"] },
  { name: "Cruce de Poleas", group: "Pecho", mode: T, aliases: ["cruces de poleas", "cruce en polea", "aperturas en polea", "crossover"] },
  { name: "Contractor de pecho", group: "Pecho", mode: T, aliases: ["peck deck", "pec deck", "contractor", "mariposa", "aperturas en maquina"] },
  { name: "Press de Pecho en Máquina de Palanca", group: "Pecho", mode: T, aliases: ["press en maquina", "press de pecho en maquina", "press pecho maquina"] },
  { name: "Fondo en Paralelas", group: "Pecho", mode: C, aliases: ["fondos", "fondos en paralelas", "paralelas", "dips"] },
  { name: "Flexiones", group: "Pecho", mode: C, aliases: ["lagartijas", "push ups"] },
  { name: "Pullover Brazos Rectos con Mancuerna", group: "Pecho", mode: T, aliases: ["pullover", "pull over", "pullover con mancuerna"] },

  // Espalda
  { name: "Dominadas", group: "Espalda", mode: C, aliases: ["dominada", "pull ups"] },
  { name: "Dominada Supina", group: "Espalda", mode: C, aliases: ["dominadas supinas", "chin ups", "dominadas agarre supino"] },
  { name: "Jalón al pecho", group: "Espalda", mode: T, aliases: ["jalon", "jalones", "jalon en polea", "polea al pecho", "jalon dorsal"] },
  { name: "Jalón con agarre estrecho", group: "Espalda", mode: T, aliases: ["jalon estrecho", "jalon agarre cerrado"] },
  { name: "Remo Inclinado con Barra", group: "Espalda", mode: T, aliases: ["remo con barra", "remo barra"] },
  { name: "Remo con Mancuerna", group: "Espalda", mode: M, aliases: ["remo a una mano", "remo unilateral"] },
  { name: "Remo en Polea", group: "Espalda", mode: T, aliases: ["remo en polea baja", "remo sentado", "remo gironda"] },
  { name: "Remo en Máquina", group: "Espalda", mode: T, aliases: [] },
  { name: "Remo en T", group: "Espalda", mode: T, aliases: ["remo t"] },
  { name: "Peso Muerto", group: "Espalda", mode: T, aliases: ["peso muerto convencional", "deadlift"] },
  { name: "Peso Muerto Rumano", group: "Piernas", mode: T, aliases: ["rumano", "rdl"] },
  { name: "Pullover en polea", group: "Espalda", mode: T, aliases: ["pull over en polea"] },
  { name: "Hiperextensiones (Extensiones de Espalda)", group: "Espalda", mode: C, aliases: ["hiperextensiones", "extensiones lumbares", "lumbares"] },
  { name: "Encogimiento con Mancuerna", group: "Espalda", mode: M, aliases: ["encogimientos", "encogimientos con mancuernas", "encogimientos de hombros"] },
  { name: "Face pull", group: "Hombros", mode: T, aliases: ["face pulls", "tiron a la cara"] },

  // Piernas
  { name: "Sentadilla con Barra", group: "Piernas", mode: T, aliases: ["sentadilla", "sentadillas", "sentadilla trasera", "squat"] },
  { name: "Sentadilla Frontal con Barra", group: "Piernas", mode: T, aliases: ["sentadilla frontal"] },
  { name: "Sentadilla Goblet", group: "Piernas", mode: T, aliases: ["goblet"] },
  { name: "Sentadilla búlgara", group: "Piernas", mode: M, aliases: ["bulgaras", "bulgara", "zancada bulgara"] },
  { name: "Prensa de Pierna", group: "Piernas", mode: T, aliases: ["prensa", "prensa de piernas", "prensa inclinada"] },
  { name: "Sentadilla Hack", group: "Piernas", mode: T, aliases: ["hack", "hack squat"] },
  { name: "Zancadas con mancuernas", group: "Piernas", mode: M, aliases: ["zancadas", "zancada", "estocadas", "lunges"] },
  { name: "Extensión de cuádriceps", group: "Piernas", mode: T, aliases: ["extensiones de cuadriceps", "extensiones de pierna", "cuadriceps en maquina", "sillon de cuadriceps"] },
  { name: "Curl femoral tumbado", group: "Piernas", mode: T, aliases: ["curl femoral", "femoral tumbado", "femoral", "isquios"] },
  { name: "Curl femoral sentado", group: "Piernas", mode: T, aliases: ["femoral sentado"] },
  { name: "Hip Thrust con Barra", group: "Piernas", mode: T, aliases: ["hip thrust", "empuje de cadera", "puente de gluteo con barra"] },
  { name: "Patada de glúteo en polea", group: "Piernas", mode: T, aliases: ["patada de gluteo", "patadas de gluteo"] },
  { name: "Abductores en máquina", group: "Piernas", mode: T, aliases: ["abductores", "abduccion"] },
  { name: "Aductores en máquina", group: "Piernas", mode: T, aliases: ["aductores", "aduccion"] },
  { name: "Gemelos de pie", group: "Piernas", mode: T, aliases: ["gemelos", "elevacion de talones", "pantorrillas"] },
  { name: "Gemelos sentado", group: "Piernas", mode: T, aliases: [] },
  { name: "Subidas al cajón", group: "Piernas", mode: M, aliases: ["step up", "subidas al banco"] },

  // Hombros
  { name: "Press Militar de Pie", group: "Hombros", mode: T, aliases: ["press militar", "press militar con barra", "press de hombro con barra", "overhead press"] },
  { name: "Press de Hombro con Mancuerna", group: "Hombros", mode: M, aliases: ["press de hombros", "press de hombro", "press de hombros con mancuernas", "press militar con mancuernas"] },
  { name: "Press Arnold con Mancuerna", group: "Hombros", mode: M, aliases: ["press arnold"] },
  { name: "Press Militar de Hombro en Máquina", group: "Hombros", mode: T, aliases: ["press de hombros en maquina", "press hombro maquina"] },
  { name: "Elevación Lateral con Mancuerna", group: "Hombros", mode: M, aliases: ["elevaciones laterales", "laterales", "vuelos laterales", "elevacion lateral"] },
  { name: "Elevación Lateral en Polea", group: "Hombros", mode: T, aliases: ["laterales en polea", "elevaciones laterales en polea"] },
  { name: "Elevación Frontal con Mancuerna", group: "Hombros", mode: M, aliases: ["elevaciones frontales", "frontales", "elevacion frontal"] },
  { name: "Pájaros", group: "Hombros", mode: M, aliases: ["pajaro", "elevaciones posteriores", "vuelos posteriores"] },
  { name: "Deltoides posterior en máquina", group: "Hombros", mode: T, aliases: ["posterior en maquina", "peck deck inverso", "contractor inverso"] },
  { name: "Remo al mentón", group: "Hombros", mode: T, aliases: ["remo vertical"] },

  // Bíceps
  { name: "Curl con Barra", group: "Bíceps", mode: T, aliases: ["curl de biceps con barra", "curl barra"] },
  { name: "Curl con Barra Z", group: "Bíceps", mode: T, aliases: ["curl barra z"] },
  { name: "Curl de Bíceps con Mancuerna", group: "Bíceps", mode: M, aliases: ["curl con mancuernas", "curl de biceps", "curl biceps", "curl alterno"] },
  { name: "Curl Martillo", group: "Bíceps", mode: M, aliases: ["martillo", "curl de martillo"] },
  { name: "Curl en banco Scott", group: "Bíceps", mode: T, aliases: ["curl scott", "banco scott", "curl predicador"] },
  { name: "Curl en polea", group: "Bíceps", mode: T, aliases: ["curl de biceps en polea"] },
  { name: "Curl de Concentración", group: "Bíceps", mode: T, aliases: ["curl concentrado"] },

  // Tríceps
  { name: "Extensión de tríceps en polea", group: "Tríceps", mode: T, aliases: ["triceps en polea", "jalon de triceps", "pushdown", "triceps con cuerda", "extensiones de triceps"] },
  { name: "Press francés", group: "Tríceps", mode: T, aliases: ["rompecraneos", "skull crushers"] },
  { name: "Extensión de tríceps sobre la cabeza", group: "Tríceps", mode: T, aliases: ["extension sobre la cabeza", "triceps por encima de la cabeza", "copa"] },
  { name: "Fondos entre bancos", group: "Tríceps", mode: C, aliases: ["fondos en banco"] },
  { name: "Press de Banca Agarre Cerrado con Barra", group: "Tríceps", mode: T, aliases: ["press cerrado", "press agarre cerrado", "press de banca cerrado", "press de banca con agarre cerrado"] },
  { name: "Patada de Tríceps con Mancuerna", group: "Tríceps", mode: M, aliases: ["patada de triceps", "patadas de triceps"] },

  // Core
  { name: "Abdominales", group: "Core", mode: C, aliases: ["crunch", "crunches", "encogimientos abdominales"] },
  { name: "Elevación de Piernas Colgado", group: "Core", mode: C, aliases: ["elevaciones de piernas", "elevacion de piernas"] },
  { name: "Rueda Abdominal", group: "Core", mode: C, aliases: ["rueda"] },
  { name: "Crunch en Polea", group: "Core", mode: T, aliases: ["abdominales en polea"] },
];

const GROUP_BY_SLUG: Record<string, MuscleGroup> = {
  chest: "Pecho",
  lats: "Espalda",
  "middle-back": "Espalda",
  "lower-back": "Espalda",
  traps: "Espalda",
  quadriceps: "Piernas",
  hamstrings: "Piernas",
  glutes: "Piernas",
  calves: "Piernas",
  adductors: "Piernas",
  abductors: "Piernas",
  shoulders: "Hombros",
  neck: "Hombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  forearms: "Antebrazo",
  abdominals: "Core",
};

/** Convención de peso deducida del material: mancuernas y pesas rusas, por unidad. */
export function modeFromEquipment(equipment: string[]): WeightMode | null {
  if (equipment.some((e) => e === "Mancuerna" || e === "Pesas Rusas")) return "per_dumbbell";
  if (equipment.some((e) => ["Barra", "Barra Z", "Polea", "Máquina", "Balón Medicinal", "Otro"].includes(e))) {
    return "total";
  }
  if (equipment.includes("Peso Corporal")) return "bodyweight";
  return null; // bandas, fitball…: que lo decida quien lo use
}

const key = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

type KineticRow = { name: string; primary: string[]; equipment: string[] };

/** Catálogo completo: primero los habituales (sus alias tienen prioridad), luego el resto. */
export function buildCatalog(): CatalogEntry[] {
  const entries = new Map<string, CatalogEntry>();
  for (const c of CURATED) entries.set(key(c.name), { ...c, featured: true });
  for (const row of kinetic as KineticRow[]) {
    if (entries.has(key(row.name))) continue;
    entries.set(key(row.name), {
      name: row.name,
      group: GROUP_BY_SLUG[row.primary[0] ?? ""] ?? "Otros",
      mode: modeFromEquipment(row.equipment),
      aliases: [],
      featured: false,
    });
  }
  return [...entries.values()];
}
