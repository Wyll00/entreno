import { History } from "@/components/History.tsx";
import { requireUser } from "@/lib/require-user.ts";

export const metadata = { title: "Historial · Entrenos" };

export default async function HistoryPage() {
  await requireUser();
  return <History />;
}
