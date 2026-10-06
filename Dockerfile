# Imagen reproducible: versión de Node fijada y dependencias desde package-lock.json.
FROM node:24.18.0-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24.18.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_PATH=/data/workouts.sqlite \
    BACKUP_DIR=/backups
COPY --from=build /app/package.json /app/next.config.mjs ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib ./src/lib
RUN mkdir -p /data /backups && chown node:node /data /backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migraciones antes de aceptar tráfico; si fallan, el contenedor no arranca.
CMD ["sh", "-c", "node scripts/migrate.ts && exec node_modules/.bin/next start -H 0.0.0.0 -p 3000"]
