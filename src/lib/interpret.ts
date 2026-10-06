// Intérprete de frases de entrenamiento («press inclinado 60 kilos 8
// repeticiones»). Es determinista y local: no llama a ningún servicio.
//
// Reglas que no se rompen:
// - nunca se inventa un peso, unas repeticiones ni un ejercicio: lo que falta
//   se pregunta;
// - el ejercicio sale del catálogo (o del ejercicio activo confirmado de la
//   sesión, si la frase no nombra ninguno);
// - la convención de peso se dice, se toma del hábito (última serie de ese
//   ejercicio) o del catálogo, y siempre se muestra.
import { isNumberToken, similarity, STOP_WORDS, tokenize, withinOneEdit } from "./text.ts";
import { gramsToKg, kgToGrams, type WeightMode } from "./units.ts";

export type KnownExercise = {
  id: string;
  name: string;
  /** Alias como listas de tokens (ver phraseKey). Incluye el propio nombre. */
  aliases: string[][];
  defaultWeightMode: WeightMode | null;
  lastWeightMode: WeightMode | null;
  lastDate: string | null;
  featured: boolean;
};

export type InterpretContext = {
  exercises: KnownExercise[];
  activeExercise: { id: string; name: string } | null;
};

export type Missing = "ejercicio" | "peso" | "repeticiones" | "tipo de peso";

export type InterpretedItem = {
  exerciseId: string | null;
  exerciseName: string | null;
  /** Cómo se decidió el ejercicio: nombrado en la frase o ejercicio activo. */
  exerciseSource: "said" | "active" | null;
  /** Si no se sabe el ejercicio: opciones, con su convención de peso para rellenarla al elegir. */
  candidates: { id: string; name: string; weightMode: WeightMode | null }[];
  /** Lo que sonaba a nombre de ejercicio pero no está en el catálogo («hip trast»). */
  heardName: string | null;
  weightKg: string | null;
  weightMode: WeightMode | null;
  modeSource: "said" | "habit" | "catalog" | null;
  reps: number | null;
  missing: Missing[];
};

export type Interpretation = {
  status: "ready" | "needs_clarification" | "no_workout";
  label: string | null;
  items: InterpretedItem[];
  questions: string[];
};

const WEIGHT_UNITS = new Set(["kilo", "kilos", "kg", "kgs", "k", "quilos", "kilogramo", "kilogramos"]);
const REP_WORDS = new Set(["repeticion", "repeticiones", "reps", "rep", "repes", "veces", "vez"]);
const SET_WORDS = new Set(["serie", "series", "set", "sets", "tanda", "tandas"]);
const DUMBBELL_WORDS = new Set(["mancuerna", "mancuernas", "pesa", "pesas"]);
const WEIGHT_PREP = new Set(["con", "a", "de"]);
const REP_PREP = new Set(["para", "hice", "hago", "hacer", "haciendo", "hecho", "saque", "sacar", "sacado"]);
const CORRECTION_WORDS = new Set([
  "corrige", "corregir", "corrigeme", "equivoque", "equivocado", "rectifico", "borra", "borrar", "quita", "quitar",
  "cambia", "cambiar", "elimina", "eliminar",
]);
const GROUP_WORDS: Record<string, string> = {
  pecho: "Pecho", espalda: "Espalda", pierna: "Pierna", piernas: "Pierna", hombro: "Hombro", hombros: "Hombro",
  brazo: "Brazo", brazos: "Brazo", biceps: "Bíceps", triceps: "Tríceps", gluteo: "Glúteo", gluteos: "Glúteo",
  core: "Core", abdomen: "Abdomen", torso: "Torso", dorsales: "Dorsales", cuadriceps: "Cuádriceps",
};
const LABEL_VERBS = new Set([
  "hice", "hago", "hecho", "toca", "tocaba", "toco", "entreno", "entrene", "entrenado", "dia", "rutina", "sesion",
  "trabaje", "trabajo", "trabajado", "voy", "vamos",
]);
const MAX_SETS_PER_PHRASE = 10;
const MAX_ITEMS = 30;

// ——— Ejercicios ———

type Match = { start: number; end: number; size: number; exercise: KnownExercise };

function sameWord(text: string, alias: string): boolean {
  if (text === alias) return true;
  if (text + "s" === alias || alias + "s" === text || text + "es" === alias || alias + "es" === text) return true;
  return text.length >= 5 && alias.length >= 5 && withinOneEdit(text, alias);
}

/** Coincidencias de alias sin solaparse; gana la más larga (más concreta). */
function findMatches(tokens: string[], exercises: KnownExercise[]): Match[] {
  // «con dos mancuernas»: el número de mancuernas no corta el nombre del ejercicio.
  const content = tokens
    .map((_, i) => i)
    .filter((i) => !STOP_WORDS.has(tokens[i]) && !(isNumberToken(tokens[i]) && DUMBBELL_WORDS.has(tokens[i + 1])));
  const found: Match[] = [];
  for (let c = 0; c < content.length; c++) {
    for (const exercise of exercises) {
      for (const alias of exercise.aliases) {
        if (alias.length === 0 || c + alias.length > content.length) continue;
        let ok = true;
        for (let k = 0; k < alias.length && ok; k++) ok = sameWord(tokens[content[c + k]], alias[k]);
        if (ok) found.push({ start: content[c], end: content[c + alias.length - 1] + 1, size: alias.length, exercise });
      }
    }
  }
  found.sort(
    (a, b) =>
      b.size - a.size || a.start - b.start || Number(b.exercise.featured) - Number(a.exercise.featured),
  );
  const chosen: Match[] = [];
  for (const m of found) {
    if (!chosen.some((o) => m.start < o.end && o.start < m.end)) chosen.push(m);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

const FILLER = new Set([
  "otra", "otro", "otras", "mas", "luego", "despues", "baje", "subi", "bajado", "subido", "hoy", "ayer", "anteayer",
  "levante", "levanto", "tambien", "primero", "ultima", "ultimo", "bien", "vale", "pues", "unas", "unos", "por",
  "para", "sin", "peso", "corporal", "total", "cada", "barra", "lastre", "venga", "ahora", "bueno", "entonces",
  "mismo", "misma", "igual", "he", "ha", "has", "hemos", "acabo", "acabe", "termine", "empiezo", "empece", "tengo",
  "llevo", "solo", "muy", "poco", "casi", "fallo", "ok", "okay", "si", "no", "que", "ya", "x", "un", "una", "uno",
  "me", "te", "se", "le", "lo", "mi", "tu", "su", "duele", "dolor", "molesta",
]);

function isFiller(word: string): boolean {
  return (
    FILLER.has(word) ||
    WEIGHT_UNITS.has(word) ||
    REP_WORDS.has(word) ||
    SET_WORDS.has(word) ||
    DUMBBELL_WORDS.has(word) ||
    REP_PREP.has(word) ||
    LABEL_VERBS.has(word) ||
    GROUP_WORDS[word] !== undefined
  );
}

/**
 * Palabras que pueden ser el nombre de un ejercicio: ni cifras, ni relleno, ni unidades.
 * Un grupo muscular («tríceps») cuenta si va con otras palabras («extensión tríceps soga»),
 * pero no solo: «hoy hice pecho» no es un ejercicio.
 */
function nameWords(tokens: string[]): string[] {
  const words = tokens.filter(
    (w) => !STOP_WORDS.has(w) && !isNumberToken(w) && w.length >= 2 && (!isFiller(w) || GROUP_WORDS[w] !== undefined),
  );
  return words.every((w) => GROUP_WORDS[w] !== undefined) ? [] : words;
}

/**
 * Parecido de lo dicho con un ejercicio (0 a 1): mitad parecido de letras del mejor
 * tramo de 1 a 4 palabras con algún alias, mitad cuántas de las palabras dichas
 * aparecen (o casi) en ese alias. Así «extensión tríceps soga» queda más cerca de
 * «extensiones de tríceps» que de «extensión de piernas».
 */
export function bestSimilarity(words: string[], exercise: KnownExercise): number {
  let best = 0;
  for (const alias of exercise.aliases) {
    const aliasText = alias.join(" ");
    let dice = 0;
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j <= Math.min(words.length, i + 4); j++) {
        const phrase = words.slice(i, j).join(" ");
        if (phrase.length < 5) continue; // «hace» no debe parecerse a «hack»
        dice = Math.max(dice, similarity(phrase, aliasText));
      }
    }
    const covered = words.filter((w) => alias.some((a) => sameWord(w, a) || similarity(w, a) >= 0.6)).length;
    best = Math.max(best, 0.5 * dice + 0.5 * (covered / words.length));
  }
  return best;
}

const byUse = (a: KnownExercise, b: KnownExercise) =>
  (b.lastDate ?? "").localeCompare(a.lastDate ?? "") ||
  Number(b.featured) - Number(a.featured) ||
  a.name.localeCompare(b.name, "es");

/**
 * Ejercicio no reconocido: opciones para elegir.
 * - Si una palabra es el comienzo de varios nombres («remo», «curl»), esos, ordenados por
 *   parecido con todo lo dicho («curl femoral acostado» → primero los femorales).
 * - Si no, los de nombre parecido («hip trast» → Hip Thrust).
 */
export function suggestionsFor(tokens: string[], exercises: KnownExercise[], minScore: number): KnownExercise[] {
  const words = nameWords(tokens);
  if (words.length === 0) return [];
  const head = exercises.filter((e) =>
    e.aliases.some((a) => a.length >= 2 && words.some((w) => w.length >= 3 && sameWord(w, a[0]))),
  );
  const pool = head.length > 0 ? head : exercises;
  return pool
    .map((exercise) => ({ exercise, score: bestSimilarity(words, exercise) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score || byUse(a.exercise, b.exercise))
    .slice(0, 6)
    .map((s) => s.exercise);
}

function detectLabel(tokens: string[], covered: Set<number>): string | null {
  for (let i = 0; i < tokens.length; i++) {
    if (covered.has(i) || !GROUP_WORDS[tokens[i]]) continue;
    const before = tokens.slice(Math.max(0, i - 3), i);
    if (!before.some((t) => LABEL_VERBS.has(t))) continue;
    const parts = [GROUP_WORDS[tokens[i]]];
    let j = i + 1;
    while ((tokens[j] === "y" || tokens[j] === "e") && GROUP_WORDS[tokens[j + 1]] && !covered.has(j + 1)) {
      parts.push(GROUP_WORDS[tokens[j + 1]].toLowerCase());
      j += 2;
    }
    return parts.join(" y ");
  }
  return null;
}

// ——— Cifras ———

type Fact = { kind: "weight" | "reps" | "sets" | "unknown"; value: string };
type Partial = { weight: string | null; reps: string | null; count: string | null };

function readFacts(tokens: string[]): Fact[] {
  const facts: Fact[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const value = tokens[i];
    if (!isNumberToken(value)) continue;
    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    if (next && DUMBBELL_WORDS.has(next)) continue; // «dos mancuernas de 20»: el 2 no es peso
    if (next && WEIGHT_UNITS.has(next)) facts.push({ kind: "weight", value });
    else if (next && REP_WORDS.has(next)) facts.push({ kind: "reps", value });
    else if (next && SET_WORDS.has(next)) facts.push({ kind: "sets", value });
    else if ((next === "por" || next === "x") && isNumberToken(tokens[i + 2])) {
      facts.push({ kind: "weight", value }, { kind: "reps", value: tokens[i + 2] });
      i += 2;
    } else if (prev && REP_PREP.has(prev)) facts.push({ kind: "reps", value });
    else if (prev === "de" && facts.at(-1)?.kind === "sets") facts.push({ kind: "reps", value });
    else if (prev && WEIGHT_PREP.has(prev)) facts.push({ kind: "weight", value });
    else facts.push({ kind: "unknown", value });
  }
  return facts;
}

/** Agrupa las cifras en series. Un peso dicho vale para las repeticiones que le siguen. */
function groupFacts(facts: Fact[]): Partial[] {
  const sets: Partial[] = [];
  let cur: Partial = { weight: null, reps: null, count: null };
  const push = () => {
    if (cur.weight !== null || cur.reps !== null || cur.count !== null) sets.push(cur);
    cur = { weight: null, reps: null, count: null };
  };
  facts.forEach((fact, k) => {
    let kind = fact.kind;
    if (kind === "unknown") {
      if (cur.weight === null && cur.reps === null) kind = facts[k + 1]?.kind === "weight" ? "reps" : "weight";
      else if (cur.reps === null) kind = "reps";
      else if (cur.weight === null) kind = "weight";
      else kind = "reps"; // «60 por 8 y 7»: otra serie con el mismo peso
    }
    if (kind === "weight") {
      if (cur.weight !== null) push();
      cur.weight = fact.value;
    } else if (kind === "reps") {
      if (cur.reps !== null) {
        const weight = cur.weight;
        push();
        cur.weight = weight;
      }
      cur.reps = fact.value;
    } else if (kind === "sets") {
      if (cur.count !== null) push();
      cur.count = fact.value;
    }
  });
  push();
  return sets;
}

function saidMode(tokens: string[]): WeightMode | null {
  const has = (w: string) => tokens.includes(w);
  if (has("corporal") || (has("sin") && (has("peso") || has("lastre")))) return "bodyweight";
  if ([...DUMBBELL_WORDS].some(has) || has("cada")) return "per_dumbbell";
  if (has("total") || has("incluida")) return "total";
  return null;
}

// ——— Frase completa ———

type Segment = {
  exercise: KnownExercise | null;
  tokens: string[];
  /** Palabras de nombre pegadas al ejercicio reconocido («jalon *tras nuca*»): puede no ser ese. */
  extra: string[];
  /** Lo dicho del nombre, tal cual (reconocido + extra), para buscar parecidos. */
  spoken: string[];
};

const isNameWord = (w: string) => !STOP_WORDS.has(w) && !isNumberToken(w) && w.length >= 2 && !isFiller(w);

/** Palabras de nombre justo antes o después de una coincidencia (saltando palabras vacías). */
function adjacentWords(tokens: string[], m: Match, covered: Set<number>): { before: string[]; after: string[] } {
  const after: string[] = [];
  for (let i = m.end; i < tokens.length && !covered.has(i); i++) {
    if (STOP_WORDS.has(tokens[i])) continue;
    if (!isNameWord(tokens[i])) break;
    after.push(tokens[i]);
  }
  const before: string[] = [];
  for (let i = m.start - 1; i >= 0 && !covered.has(i); i--) {
    if (STOP_WORDS.has(tokens[i])) continue;
    if (!isNameWord(tokens[i])) break;
    before.unshift(tokens[i]);
  }
  return { before, after };
}

function segmentsFor(tokens: string[], matches: Match[]): Segment[] {
  const covered = new Set(matches.flatMap((m) => range(m.start, m.end)));
  const slice = (from: number, to: number) => range(from, to).filter((i) => !covered.has(i)).map((i) => tokens[i]);
  const describe = (m: Match) => {
    const { before, after } = adjacentWords(tokens, m, covered);
    const said = range(m.start, m.end).map((i) => tokens[i]).filter((w) => !STOP_WORDS.has(w));
    return { extra: [...before, ...after], spoken: [...before, ...said, ...after] };
  };
  if (matches.length === 0) return [{ exercise: null, tokens, extra: [], spoken: [] }];
  if (matches.length === 1) return [{ exercise: matches[0].exercise, tokens: slice(0, tokens.length), ...describe(matches[0]) }];
  // ¿Se dice el ejercicio antes («press 60 por 8») o después («60 por 8 en press»)?
  const nameAfter = tokens.slice(0, matches[0].start).some(isNumberToken);
  return matches.map((m, k) => {
    const from = nameAfter ? (k === 0 ? 0 : matches[k - 1].end) : k === 0 ? 0 : m.start;
    const to = nameAfter ? (k === matches.length - 1 ? tokens.length : m.end) : (matches[k + 1]?.start ?? tokens.length);
    return { exercise: m.exercise, tokens: slice(from, to), ...describe(m) };
  });
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
}

function cleanWeight(value: string | null): string | null {
  if (value === null) return null;
  const grams = kgToGrams(value);
  return grams === null ? null : gramsToKg(grams);
}

function cleanReps(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= 1000 ? n : null;
}

export function interpret(text: string, context: InterpretContext): Interpretation {
  const tokens = tokenize(text);
  const matches = findMatches(tokens, context.exercises);
  const covered = new Set(matches.flatMap((m) => range(m.start, m.end)));
  const label = detectLabel(tokens, covered);
  const questions: string[] = [];

  if (tokens.some((t) => CORRECTION_WORDS.has(t)) || /\b(no eran|en realidad)\b/.test(tokens.join(" "))) {
    return {
      status: "needs_clarification",
      label,
      items: [],
      questions: ["Parece una corrección: toca ✎ o 🗑 en la serie que quieras cambiar. No he apuntado nada."],
    };
  }

  const items: InterpretedItem[] = [];
  for (const segment of segmentsFor(tokens, matches)) {
    const facts = readFacts(segment.tokens);
    let exercise = segment.exercise;
    let exerciseSource: InterpretedItem["exerciseSource"] = exercise ? "said" : null;
    let candidates: KnownExercise[] = [];
    let heardName: string | null = null;
    if (exercise && segment.extra.length > 0) {
      // «jalon tras nuca»: se reconoce «jalón», pero sobra «tras nuca». No se apunta
      // solo: se ofrecen los parecidos a todo lo dicho.
      candidates = suggestionsFor(segment.spoken, context.exercises, 0.45);
      if (!candidates.some((c) => c.id === exercise?.id)) candidates = [exercise, ...candidates].slice(0, 6);
      heardName = segment.spoken.join(" ");
      exercise = null;
      exerciseSource = null;
    } else if (!exercise) {
      // Sin cifras hace falta más parecido: así una frase cualquiera no se toma por un ejercicio.
      candidates = suggestionsFor(segment.tokens, context.exercises, facts.length > 0 ? 0.45 : 0.5);
      if (candidates.length > 0) heardName = nameWords(segment.tokens).join(" ");
      if (candidates.length === 0 && facts.length > 0 && context.activeExercise) {
        exercise = context.exercises.find((e) => e.id === context.activeExercise?.id) ?? null;
        exerciseSource = exercise ? "active" : null;
      }
      if (!exercise && facts.length === 0 && candidates.length === 0) continue; // nada de entreno aquí
    }

    const explicitMode = saidMode(segment.tokens);
    const habitual = exercise?.lastWeightMode ?? null;
    const fromCatalog = exercise?.defaultWeightMode ?? null;
    const baseMode = explicitMode ?? habitual ?? fromCatalog;
    const modeSource: InterpretedItem["modeSource"] = explicitMode
      ? "said"
      : habitual
        ? "habit"
        : fromCatalog
          ? "catalog"
          : null;

    const partials = groupFacts(facts);
    if (partials.length === 0) partials.push({ weight: null, reps: null, count: null });

    for (const partial of partials) {
      const weightKg = cleanWeight(partial.weight);
      const reps = cleanReps(partial.reps);
      let weightMode = baseMode;
      if (weightMode === "bodyweight" && weightKg !== null) {
        weightMode = null;
        questions.push(
          `«${exercise?.name ?? "Ese ejercicio"}» va con peso corporal: ¿los ${weightKg.replace(".", ",")} kg son lastre? Elige el tipo de peso.`,
        );
      }
      const missing: Missing[] = [];
      if (!exercise) missing.push("ejercicio");
      if (!weightMode) missing.push("tipo de peso");
      if (weightMode !== "bodyweight" && weightKg === null) missing.push("peso");
      if (reps === null) missing.push("repeticiones");

      const item: InterpretedItem = {
        exerciseId: exercise?.id ?? null,
        exerciseName: exercise?.name ?? null,
        exerciseSource,
        candidates: candidates.map((c) => ({ id: c.id, name: c.name, weightMode: c.lastWeightMode ?? c.defaultWeightMode })),
        heardName,
        weightKg: weightMode === "bodyweight" ? null : weightKg,
        weightMode,
        modeSource: weightMode ? modeSource : null,
        reps,
        missing,
      };

      const count = partial.count === null ? 1 : Number(partial.count);
      if (partial.count !== null && (!Number.isInteger(count) || count < 1 || count > MAX_SETS_PER_PHRASE)) {
        questions.push(`No puedo apuntar ${partial.count} series de una vez: dímelas por partes.`);
        items.push(item);
      } else if (count > 1 && missing.length > 0) {
        // «Hice tres series» sin cifras: no se inventan pesos ni repeticiones.
        questions.push(`Has dicho ${count} series: ¿con qué peso y cuántas repeticiones cada una?`);
        items.push(item);
      } else {
        for (let n = 0; n < count; n++) items.push({ ...item });
      }
    }
  }

  if (items.length === 0) {
    return {
      status: "no_workout",
      label,
      items: [],
      questions: label ? [] : ["No he entendido ningún registro. Prueba: «press banca 60 kilos 8 repeticiones»."],
    };
  }
  if (items.length > MAX_ITEMS) {
    return { status: "needs_clarification", label, items: items.slice(0, MAX_ITEMS), questions: ["Demasiadas series en una frase."] };
  }

  const missingAll = new Set(items.flatMap((i) => i.missing));
  if (missingAll.has("ejercicio")) {
    const heard = items.find((i) => i.heardName)?.heardName;
    questions.push(
      heard
        ? `No tengo «${heard}» tal cual. ¿Es alguno de estos? Si no, escríbelo.`
        : "¿Qué ejercicio era?",
    );
  }
  if (missingAll.has("peso")) questions.push("¿Con cuánto peso?");
  if (missingAll.has("repeticiones")) questions.push("¿Cuántas repeticiones?");
  if (missingAll.has("tipo de peso") && !questions.some((q) => q.includes("tipo de peso"))) {
    questions.push("¿El peso es total o por mancuerna?");
  }
  if (tokens.includes("ayer") || tokens.includes("anteayer")) {
    questions.push("Has dicho «ayer»: si no es la fecha de esta sesión, cámbiala antes de guardar.");
  }

  const ready = items.every((i) => i.missing.length === 0) && questions.length === 0;
  return { status: ready ? "ready" : "needs_clarification", label, items, questions: [...new Set(questions)] };
}
