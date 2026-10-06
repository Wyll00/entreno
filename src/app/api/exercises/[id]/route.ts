import { json, withUser } from "@/lib/api.ts";
import { getDb } from "@/lib/db.ts";
import { deleteExercise, updateExercise } from "@/lib/exercises.ts";
import { exerciseSchema, parseWith, readJson } from "@/lib/schemas.ts";

type Params = { params: Promise<{ id: string }> };

export function PATCH(request: Request, { params }: Params) {
  return withUser(request, async ({ userId }) => {
    const input = parseWith(exerciseSchema, await readJson(request));
    return json({ exercise: updateExercise(getDb(), userId, (await params).id, input) });
  });
}

export function DELETE(request: Request, { params }: Params) {
  return withUser(request, async ({ userId }) => {
    deleteExercise(getDb(), userId, (await params).id);
    return json({ deleted: true });
  });
}
