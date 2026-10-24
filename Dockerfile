FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_REALTIME_DRIVER=socketio
ARG NEXT_PUBLIC_SOCKET_URL=
ARG NEXT_PUBLIC_PUSHER_KEY=
ARG NEXT_PUBLIC_PUSHER_CLUSTER=ap1
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=
ENV NEXT_PUBLIC_REALTIME_DRIVER=$NEXT_PUBLIC_REALTIME_DRIVER NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL NEXT_PUBLIC_PUSHER_KEY=$NEXT_PUBLIC_PUSHER_KEY NEXT_PUBLIC_PUSHER_CLUSTER=$NEXT_PUBLIC_PUSHER_CLUSTER NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV DATABASE_URL=mysql://build:build@localhost:3306/build NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
RUN cp -r public .next/standalone/public && cp -r .next/static .next/standalone/.next/static

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && corepack enable && corepack prepare pnpm@10.33.2 --activate
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
# Retain Prisma CLI and tsx for migration jobs and the companion realtime process.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 3001
CMD ["node", ".next/standalone/server.js"]
