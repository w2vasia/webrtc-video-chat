# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY src ./src
COPY public ./public

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the server
CMD ["node", "dist/server.js"]
