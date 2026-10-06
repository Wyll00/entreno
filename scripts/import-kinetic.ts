// Genera src/lib/catalog-data/kinetic-es.json a partir de es/exercises.json de
// https://github.com/kinetic-place/exercises-db (licencia MIT).
// Se queda solo con lo que usa la app y descarta estiramientos y cardio, que
// no se registran como series de peso × repeticiones.
//
//   node scripts/import-kinetic.ts <ruta>/es/exercises.json
import fs from "node:fs";
import path from "node:path";

type Source = {
  id: string;
  name: string;
  category: string;
  muscleGroups: { slug: string; type: string }[];
  equipment: { name: string }[];
};

const input = process.argv[2];
if (!input) {
  console.error("Uso: node scripts/import-kinetic.ts <ruta a es/exercises.json>");
  process.exit(1);
}
const source = JSON.parse(fs.readFileSync(input, "utf8")) as Source[];
const SKIP = new Set(["stretching", "cardio"]);
const seen = new Set<string>();
const out = [];
for (const e of source) {
  const key = e.name.trim().toLowerCase();
  if (SKIP.has(e.category) || seen.has(key)) continue;
  seen.add(key);
  out.push({
    id: e.id,
    name: e.name.trim().replace(/\s+/g, " "),
    category: e.category,
    primary: e.muscleGroups.filter((m) => m.type === "primary").map((m) => m.slug),
    equipment: e.equipment.map((q) => q.name),
  });
}
const target = path.join(import.meta.dirname, "..", "src", "lib", "catalog-data", "kinetic-es.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(out) + "\n");
console.log(`${out.length} ejercicios escritos en ${target}`);
