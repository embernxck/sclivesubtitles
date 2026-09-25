# Образ сайта. Многослойный: зависимости и сборка остаются в промежуточных
# слоях, в готовый образ едет только то, что нужно для работы.
#
# Основа именно glibc (slim), а не Alpine: клиент базы тянет за собой родную
# библиотеку, и в package-lock.json записан её glibc-вариант. На Alpine он не
# подходит — сайт собирается, но падает уже в работе с «Cannot find module
# @libsql/linux-x64-musl».

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Под собой, а не под root: если в сайте найдут дыру, она упрётся в этого
# пользователя.
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -M -s /usr/sbin/nologin nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
