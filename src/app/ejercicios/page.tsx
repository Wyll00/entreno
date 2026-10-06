import { Exercises } from "@/components/Exercises.tsx";
import { requireUser } from "@/lib/require-user.ts";

export const metadata = { title: "Ejercicios · Entrenos" };

export default async function ExercisesPage() {
  await requireUser();
  return <Exercises />;
}
