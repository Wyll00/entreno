// Normalización de frases en castellano para reconocer ejercicios y cifras.
// Todo sale en minúsculas, sin tildes y con los números en cifras
// («sesenta y dos coma cinco» → "62.5").

const UNITS: Record<string, number> = {
  cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
};
const TEENS: Record<string, number> = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500,
};

/** Palabras tras las que «un/una/uno» es una cifra y no un artículo. */
const COUNTABLE = new Set([
  "serie", "series", "repeticion", "repeticiones", "rep", "reps", "kilo", "kilos", "kg", "vez", "veces", "mancuerna",
]);

/** Palabras vacías que no cuentan al comparar nombres de ejercicios. */
export const STOP_WORDS = new Set(["de", "del", "con", "en", "la", "el", "los", "las", "al", "a", "y", "e"]);

export const isNumberToken = (t: string | undefined): boolean => t !== undefined && /^\d+(\.\d+)?$/.test(t);

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function rawTokens(text: string): string[] {
  return stripAccents(text.toLowerCase())
    .replace(/(\d),(\d)/g, "$1.$2") // 62,5 → 62.5 (coma decimal pegada)
    .replace(/(\d)\s*x\s*(\d)/g, "$1 x $2") // 60x8
    .replace(/(\d)\s*(kgs?|kilos?)\b/g, "$1 $2") // 60kg
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\.(?!\d)|(?<!\d)\./g, " ") // puntos de frase, no decimales
    .split(/\s+/)
    .filter(Boolean);
}

/** Lee un número escrito en palabras a partir de `i`. */
function readWords(tokens: string[], i: number): { value: number; next: number } | null {
  let value = 0;
  let j = i;
  let any = false;
  if (HUNDREDS[tokens[j]] !== undefined) {
    value += HUNDREDS[tokens[j]];
    j++;
    any = true;
  }
  if (TENS[tokens[j]] !== undefined) {
    value += TENS[tokens[j]];
    j++;
    any = true;
    if (tokens[j] === "y" && UNITS[tokens[j + 1]] !== undefined && UNITS[tokens[j + 1]] > 0) {
      value += UNITS[tokens[j + 1]];
      j += 2;
    }
  } else if (TEENS[tokens[j]] !== undefined) {
    value += TEENS[tokens[j]];
    j++;
    any = true;
  } else if (UNITS[tokens[j]] !== undefined) {
    const word = tokens[j];
    // «una serie» es 1; «una con 60» es un artículo.
    if (any || !["un", "una", "uno"].includes(word) || COUNTABLE.has(tokens[j + 1] ?? "")) {
      value += UNITS[word];
      j++;
      any = true;
    }
  }
  return any ? { value, next: j } : null;
}

/**
 * Tokens normalizados con las cifras unidas: "sesenta y dos coma cinco" → ["62.5"],
 * "60 y medio" → ["60.5"].
 */
export function tokenize(text: string): string[] {
  const tokens = rawTokens(text);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    let number: string | null = null;
    if (isNumberToken(tokens[i])) {
      number = tokens[i];
      i++;
    } else {
      const words = readWords(tokens, i);
      if (words) {
        number = String(words.value);
        i = words.next;
      }
    }
    if (number === null) {
      out.push(tokens[i]);
      i++;
      continue;
    }
    // Parte decimal: «coma cinco», «coma 25», «y medio».
    if (tokens[i] === "coma" || tokens[i] === "punto") {
      if (isNumberToken(tokens[i + 1]) && !tokens[i + 1].includes(".")) {
        number = `${number}.${tokens[i + 1]}`;
        i += 2;
      } else {
        const decimals = readWords(tokens, i + 1);
        if (decimals) {
          number = `${number}.${decimals.value}`;
          i = decimals.next;
        }
      }
    } else if (tokens[i] === "y" && (tokens[i + 1] === "medio" || tokens[i + 1] === "media") && !number.includes(".")) {
      number = `${number}.5`;
      i += 2;
    }
    out.push(number);
  }
  return out;
}

/** Clave para comparar nombres: tokens con contenido, sin palabras vacías. */
export function phraseKey(text: string): string {
  return tokenize(text)
    .filter((t) => !STOP_WORDS.has(t))
    .join(" ");
}

/** Distancia de edición acotada (para errores de dictado como «varra»). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function trigrams(text: string): Map<string, number> {
  const grams = new Map<string, number>();
  for (const word of text.split(" ").filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) {
      const g = padded.slice(i, i + 3);
      grams.set(g, (grams.get(g) ?? 0) + 1);
    }
  }
  return grams;
}

/**
 * Parecido entre dos frases ya normalizadas (0 a 1), por trigramas de letras
 * (coeficiente de Dice). Tolera erratas, letras de más o de menos y palabras sueltas.
 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = trigrams(a);
  const gb = trigrams(b);
  let shared = 0;
  let total = 0;
  for (const [g, n] of ga) {
    shared += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return total === 0 ? 0 : (2 * shared) / total;
}
