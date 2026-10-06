import { json, withUser } from "@/lib/api.ts";
import { getDb } from "@/lib/db.ts";
import { listHistory } from "@/lib/workouts.ts";

export function GET(request: Request) {
  return withUser(request, ({ userId }) => {
    const url = new URL(request.url);
    const exerciseId = url.searchParams.get("exercise") || undefined;
    const limit = Number(url.searchParams.get("limit")) || undefined;
    return json({ sessions: listHistory(getDb(), userId, { exerciseId, limit }) });
  });
}
