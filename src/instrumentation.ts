// Se ejecuta una vez al arrancar el servidor, antes de atender peticiones:
// aplica las migraciones pendientes.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrateAll } = await import("./lib/migrate-all.ts");
  const result = await migrateAll();
  if (result.authTables.length || result.appMigrations.length || result.catalogSynced) {
    console.log("Migraciones aplicadas:", result);
  }
}
