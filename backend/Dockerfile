# Build context: repository root (see docker-compose.yml). The backend needs shared/ (ABI)
# and database/migrations at runtime, so they are copied alongside it.
FROM node:20-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev --no-audit --no-fund
COPY backend/src backend/src
COPY shared shared
COPY database/migrations database/migrations
RUN mkdir -p backend/data contracts/deployments && chown -R node:node backend/data
WORKDIR /app/backend
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
