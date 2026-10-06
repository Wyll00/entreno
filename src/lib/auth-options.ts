import type { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { config, isBuildPhase } from "./config.ts";
import { getDb } from "./db.ts";

const isHttps = config.publicUrl.startsWith("https://");

if (process.env.NODE_ENV === "production" && !isBuildPhase && !config.authSecret) {
  throw new Error("Falta BETTER_AUTH_SECRET en el entorno.");
}

export const authOptions = {
  appName: "Entrenos",
  baseURL: config.publicUrl,
  secret: config.authSecret ?? "solo-desarrollo-local-no-usar-en-servidor-0000",
  database: getDb(),
  trustedOrigins: [config.publicUrl, ...config.extraOrigins],
  emailAndPassword: {
    enabled: true,
    // Cuenta única creada con `npm run user:create`; nadie puede registrarse desde la web.
    disableSignUp: true,
    minPasswordLength: 10,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: isHttps,
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
  },
  telemetry: { enabled: false },
  // Durante `next build` la base es temporal y vacía: sin avisos falsos de esquema.
  logger: { disabled: isBuildPhase },
  plugins: [nextCookies()],
} satisfies Parameters<typeof betterAuth>[0];

