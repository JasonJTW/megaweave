FROM node:22-alpine AS base

# Install all dependencies for build
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build TypeScript source code
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Install production dependencies only
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Production runner image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8181

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

USER expressjs

EXPOSE 8181

CMD ["node", "dist/server.js"]