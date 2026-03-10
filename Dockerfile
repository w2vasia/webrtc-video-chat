FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lockb* ./
COPY server/package.json server/
COPY client/package.json client/
RUN bun install --frozen-lockfile
COPY . .
RUN cd client && bun run build
RUN cd server && bun build src/index.ts --outdir dist --target bun

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/migrations ./server/migrations
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/package.json ./server/
RUN cd server && bun install --production
EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", "run", "server/dist/index.js"]
