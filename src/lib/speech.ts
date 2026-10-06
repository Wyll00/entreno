/**
 * Une fragmentos de dictado. En Chrome para Android, con escucha continua,
 * cada resultado puede repetir el texto anterior («press», «press banca»…):
 * si un fragmento empieza por lo acumulado, lo sustituye en vez de añadirse.
 */
export function mergeSegments(segments: string[]): string {
  let out = "";
  for (const raw of segments) {
    const s = raw.trim();
    if (!s) continue;
    const lo = out.toLowerCase();
    const ls = s.toLowerCase();
    if (ls.startsWith(lo)) out = s;
    else if (lo.endsWith(ls)) continue;
    else out = `${out} ${s}`;
  }
  return out;
}
