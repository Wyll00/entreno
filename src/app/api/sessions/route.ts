import { json, withUser } from "@/lib/api.ts";
import { config } from "@/lib/config.ts";
import { localDate } from "@/lib/dates.ts";
import { getDb } from "@/lib/db.ts";
import { createSessionSchema, parseWith, readJson } from "@/lib/schemas.ts";
import { createSession, getOpenSession } from "@/lib/workouts.ts";

/** Sesión abierta (o null) y la fecha de hoy en la zona configurada. */
export function GET(request: Request) {
  return withUser(request, ({ userId }) =>
    json({ session: getOpenSession(getDb(), userId), today: localDate(config.timeZone), timeZone: config.timeZone }),
  );
}

/** Crea una sesión nueva; la abierta, si existe, se cierra. */
export function POST(request: Request) {
  return withUser(request, async ({ userId }) => {
    const input = parseWith(createSessionSchema, await readJson(request));
    return json({ session: createSession(getDb(), userId, { ...input, timeZone: config.timeZone }) }, 201);
  });
}
