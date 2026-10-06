/** «Buenas tardes, William» según la hora local (Atlantic/Canary por defecto). */
export function greeting(name: string, timeZone: string, at: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(at),
  );
  const part = hour >= 6 && hour < 14 ? "Buenos días" : hour >= 14 && hour < 21 ? "Buenas tardes" : "Buenas noches";
  const first = name.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
