import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm.tsx";
import { auth } from "@/lib/auth.ts";

export const metadata = { title: "Entrar · Entrenos" };

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");
  return <LoginForm />;
}
