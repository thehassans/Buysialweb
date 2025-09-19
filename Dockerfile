# Multi-stage Dockerfile for BuySial Commerce (frontend + backend)
# Target runtime port is 8080

# --------------------
# Stage 1: Build frontend
# --------------------
FROM node:20-bookworm-slim AS frontend_builder
WORKDIR /app/frontend
# Install deps first for better caching
COPY frontend/package*.json ./
RUN npm ci
# Copy source and build
COPY frontend/ .
RUN npm run build

# --------------------
# Stage 2: Install backend production deps
# --------------------
FROM node:20-bookworm-slim AS backend_deps
WORKDIR /app/backend
COPY backend/package*.json ./
# Install only production dependencies
RUN npm ci --omit=dev

# --------------------
# Stage 3: Final runtime
# --------------------
FROM node:20-bookworm-slim AS runner
# Create app directories
WORKDIR /app

# Copy production backend node_modules and package files
COPY --from=backend_deps /app/backend/node_modules /app/backend/node_modules
COPY backend/package*.json /app/backend/

# Copy backend source
COPY backend/src /app/backend/src

# Copy pre-built frontend static files to be served by backend
COPY --from=frontend_builder /app/frontend/dist /app/frontend/dist

# Ensure runtime data directories exist (mount persistent volumes in your platform for these)
RUN mkdir -p /app/backend/uploads /app/backend/.wa-auth

# Environment
ENV NODE_ENV=production
# Platform will set PORT, but we default to 8080
ENV PORT=8080
EXPOSE 8080

# Work inside backend so its static-serve path ../frontend/dist resolves correctly
WORKDIR /app/backend

# Start the API (serves SPA from ../frontend/dist if present)
CMD ["node", "src/index.js"]
