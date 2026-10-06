// Cambia la contraseña de la cuenta desde el servidor y cierra todas sus sesiones.
import { auth } from "../src/lib/auth.ts";
import { argValue, ask, askHidden } from "./prompt.ts";

const email = (argValue("email") ?? (await ask("Correo de la cuenta: "))).toLowerCase();
const ctx = await auth.$context;
const found = await ctx.internalAdapter.findUserByEmail(email);
if (!found) {
  console.error("No existe ninguna cuenta con ese correo.");
  process.exit(1);
}
const password = await askHidden("Nueva contraseña (mín. 10 caracteres): ");
if (!process.env.ENTRENOS_PASSWORD) {
  const repeat = await askHidden("Repítela: ");
  if (repeat !== password) throw new Error("Las contraseñas no coinciden.");
}
if (password.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres.");

await ctx.internalAdapter.updatePassword(found.user.id, await ctx.password.hash(password));
await ctx.internalAdapter.deleteUserSessions(found.user.id);
console.log("Contraseña cambiada. Se han cerrado todas las sesiones abiertas.");
