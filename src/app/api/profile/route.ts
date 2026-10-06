import { json, withUser } from "@/lib/api.ts";
import { config } from "@/lib/config.ts";
import { localDate } from "@/lib/dates.ts";
import { getDb } from "@/lib/db.ts";
import { getProfile } from "@/lib/profile.ts";

/** Resumen de progreso. ?exercise=<id> elige el ejercicio de la gráfica. */
export function GET(request: Request) {
  return withUser(request, ({ userId, userName }) => {
    const exerciseId = new URL(request.url).searchParams.get("exercise") || undefined;
    return json(getProfile(getDb(), { id: userId, name: userName }, { today: localDate(config.timeZone), exerciseId }));
  });
}
