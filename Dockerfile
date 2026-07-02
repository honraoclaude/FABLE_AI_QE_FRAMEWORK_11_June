# QE Intelligence Portal — single-container deployment (Railway / Render / Fly).
# Builds the React dashboard, then runs the Express server which serves both
# the API and the static dashboard on $PORT.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY web/package.json web/
COPY e2e/package.json e2e/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build --workspace=web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/server server
COPY --from=build /app/web/dist web/dist
COPY --from=build /app/node_modules node_modules

# SQLite lives on the mounted volume in production (set QE_DB_PATH accordingly,
# e.g. /data/qe-portal.db with a Railway/Render disk attached at /data).
EXPOSE 4000
CMD ["npx", "tsx", "server/src/index.ts"]
