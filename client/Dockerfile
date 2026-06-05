# Multi-stage build for client
FROM node:22-alpine AS builder

# Enable pnpm via corepack (version pinned by package.json "packageManager")
RUN corepack enable

WORKDIR /app

# Copy manifest + lockfile (from root context)
COPY client/package.json client/pnpm-lock.yaml client/pnpm-workspace.yaml ./

# Install dependencies (frozen = reproducible; lifecycle scripts blocked by default)
RUN pnpm install --frozen-lockfile

# Copy source and shared data
COPY client/ ./
COPY shared/ ../shared/

# Build for production
RUN pnpm run build

# Production image
FROM node:22-alpine

WORKDIR /app

# Install lightweight HTTP server
RUN npm install -g serve

# Copy built app from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5173/ || exit 1

# Serve static files
CMD ["serve", "-s", "dist", "-l", "5173"]
