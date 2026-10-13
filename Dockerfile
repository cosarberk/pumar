# Pulse — tek image: Fastify API + gömülü web (Vite build, same-origin /api).
# Depo kökünden build edilir:  docker build -t ghcr.io/cosarberk/pumar .
#
# Pulse derleme adımı tutmaz; API ve collector doğrudan tsx ile koşar. Bu yüzden
# runtime image kaynak + node_modules taşır; yalnızca web statik olarak derlenir.

FROM node:22-slim AS build
WORKDIR /app
COPY . .
# Tüm workspace bağımlılıkları (tsx/vite dahil) — reproducible için npm ci.
RUN npm ci
# Web'i statiğe derle → apps/web/dist (API bunu same-origin serve eder).
RUN npm run build -w @pulse/web

FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV API_PORT=4000
WORKDIR /app
# Kaynak + node_modules + derlenmiş web dist. tsx runtime'da mevcut.
COPY --from=build /app ./
EXPOSE 4000
# Collector da aynı image içindedir; /sync onu `npx tsx` ile tetikler.
CMD ["npx", "tsx", "apps/api/src/server.ts"]
