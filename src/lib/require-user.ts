import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth.ts";

/** Para páginas: sin sesión válida, al login. Los endpoints comprueban por su cuenta. */
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session.user;
}
