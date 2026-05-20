# Railway API — build from repo root (needs trading/ + server/)
FROM node:20-alpine AS build

RUN apk add --no-cache openssl

WORKDIR /app

COPY trading ./trading
COPY server/package.json server/package-lock.json ./server/
COPY server/prisma ./server/prisma/
COPY server/tsconfig.json server/tsconfig.build.json server/nest-cli.json ./server/
COPY server/scripts ./server/scripts/
COPY server/src ./server/src/

WORKDIR /app/server
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm ci
RUN npx prisma generate
RUN npm run build
RUN test -f dist/main.js && test -f dist/quant/index.js

FROM node:20-alpine AS run

RUN apk add --no-cache openssl

WORKDIR /app/server

# Copy full build output (avoids prisma CLI missing in production install)
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/package.json ./
COPY --from=build /app/server/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080

CMD ["node", "dist/main.js"]
