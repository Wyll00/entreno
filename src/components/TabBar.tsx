import Link from "next/link";
import { IconHistory, IconList, IconToday, IconUser } from "./icons.tsx";

type Tab = "today" | "history" | "exercises" | "profile";

const TABS: { id: Tab; href: string; label: string; Icon: typeof IconToday }[] = [
  { id: "today", href: "/", label: "Hoy", Icon: IconToday },
  { id: "history", href: "/historial", label: "Historial", Icon: IconHistory },
  { id: "exercises", href: "/ejercicios", label: "Ejercicios", Icon: IconList },
  { id: "profile", href: "/perfil", label: "Perfil", Icon: IconUser },
];

export function TabBar({ current }: { current: Tab }) {
  return (
    <nav className="tabbar" aria-label="Secciones">
      {TABS.map(({ id, href, label, Icon }) => (
        <Link key={id} className="tab" href={href} aria-current={current === id ? "page" : undefined}>
          <Icon size={22} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
