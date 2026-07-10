# Stage 1: Dependencies installation
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package descriptors
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set BACKEND_URL during build so it is baked into Next.js routes manifest
ARG BACKEND_URL=http://backend:6767
ENV BACKEND_URL=$BACKEND_URL

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js starts on port 6768 as configured in package.json
EXPOSE 6768

# Copy build output and dependencies
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

CMD ["npm", "run", "start"]
