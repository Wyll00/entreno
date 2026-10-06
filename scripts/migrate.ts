import { migrateAll } from "../src/lib/migrate-all.ts";

const result = await migrateAll();
console.log("Base de datos al día.", result);
