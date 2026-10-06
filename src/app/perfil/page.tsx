import { Profile } from "@/components/Profile.tsx";
import { requireUser } from "@/lib/require-user.ts";

export const metadata = { title: "Perfil · Entrenos" };

export default async function ProfilePage() {
  await requireUser();
  return <Profile />;
}
