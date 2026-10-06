import { json, withUser } from "@/lib/api.ts";
import { getDb } from "@/lib/db.ts";
import { parseSet, readJson } from "@/lib/schemas.ts";
import { deleteSet, updateSet } from "@/lib/workouts.ts";

type Params = { params: Promise<{ id: string }> };

export function PATCH(request: Request, { params }: Params) {
  return withUser(request, async ({ userId }) => {
    const data = parseSet(await readJson(request));
    return json({ set: updateSet(getDb(), userId, (await params).id, data) });
  });
}

export function DELETE(request: Request, { params }: Params) {
  return withUser(request, async ({ userId }) => {
    deleteSet(getDb(), userId, (await params).id);
    return json({ deleted: true });
  });
}
