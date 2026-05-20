# Railway / Docker — build API from repo root (needs trading/ + server/)
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
RUN npm ci
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS run

RUN apk add --no-cache openssl

WORKDIR /app/server
ENV NODE_ENV=production

COPY --from=build /app/server/package.json /app/server/package-lock.json ./
RUN npm ci --omit=dev && npx prisma generate

COPY --from=build /app/server/dist ./dist

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/main.js"]
