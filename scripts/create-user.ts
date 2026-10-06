// Crea la única cuenta de la aplicación. El registro público está cerrado
// (disableSignUp), así que esta es la única vía. Usa las API internas de
// Better Auth para el hash y la cuenta, igual que su propio registro.
import { getDb } from "../src/lib/db.ts";
import { migrateAll } from "../src/lib/migrate-all.ts";
import { argValue, ask, askHidden } from "./prompt.ts";

await migrateAll();
const existing = getDb().prepare('SELECT COUNT(*) AS n FROM "user"').get() as { n: number };
if (existing.n > 0) {
  console.error("Ya existe una cuenta. Para cambiar la contraseña usa: npm run user:password");
  process.exit(1);
}

const email = (argValue("email") ?? (await ask("Correo: "))).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Correo no válido.");
const name = argValue("name") ?? ((await ask("Nombre: ")) || "Yo");

const password = await askHidden("Contraseña (mín. 10 caracteres): ");
if (!process.env.ENTRENOS_PASSWORD) {
  const repeat = await askHidden("Repite la contraseña: ");
  if (repeat !== password) throw new Error("Las contraseñas no coinciden.");
}
if (password.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres.");

const { auth } = await import("../src/lib/auth.ts");
const ctx = await auth.$context;
const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true }, { method: "admin" });
await ctx.internalAdapter.linkAccount({
  userId: user.id,
  providerId: "credential",
  accountId: user.id,
  password: await ctx.password.hash(password),
});
const { ensureCatalog } = await import("../src/lib/exercises.ts");
ensureCatalog(getDb(), user.id);
console.log(`Cuenta creada para ${email}, con el catálogo de ejercicios.`);
