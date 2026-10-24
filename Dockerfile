# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=capfootball-pnpm,target=/pnpm/store,sharing=locked \
    PRISMA_SKIP_POSTINSTALL_GENERATE=true pnpm install --no-frozen-lockfile --prefer-offline --store-dir=/pnpm/store
COPY . .
ARG NEXT_PUBLIC_PUSHER_KEY=
ARG NEXT_PUBLIC_PUSHER_CLUSTER=ap1
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=
ENV NEXT_PUBLIC_PUSHER_KEY=$NEXT_PUBLIC_PUSHER_KEY NEXT_PUBLIC_PUSHER_CLUSTER=$NEXT_PUBLIC_PUSHER_CLUSTER NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
# Placeholder for Prisma code generation only; the real URL is read from VPS .env at runtime.
ENV DATABASE_URL=mysql://build:build@localhost:3306/build NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,id=capfootball-next,target=/app/.next/cache,sharing=locked pnpm build
RUN cp -r public .next/standalone/public && cp -r .next/static .next/standalone/.next/static

FROM base AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=2019 NEXT_TELEMETRY_DISABLED=1
# Keep the verified runtime layout and generated Prisma engine.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 2019
CMD ["node", ".next/standalone/server.js"]
