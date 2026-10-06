import { createAuthClient } from "better-auth/react";

// Sin baseURL: usa el mismo origen desde el que se abre la app.
export const authClient = createAuthClient();
