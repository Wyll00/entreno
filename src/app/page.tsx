import { Today } from "@/components/Today.tsx";
import { config } from "@/lib/config.ts";
import { greeting } from "@/lib/greeting.ts";
import { requireUser } from "@/lib/require-user.ts";

export default async function HomePage() {
  const user = await requireUser();
  return <Today greeting={greeting(user.name, config.timeZone)} />;
}
