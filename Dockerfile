# Multi-stage build for a standalone Next.js server. Runs as a non-root user and
# ships only the compiled output, so the image has no toolchain in it.

FROM node:24.20.0-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public env vars are baked into the client bundle at build time.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
