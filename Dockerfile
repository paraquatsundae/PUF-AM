# PUFOM — production image for Cloud Run
FROM node:20-bookworm-slim

WORKDIR /app

# ca-certificates + build tools (no native deps ship today; kept so adding one does not break the image)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* at build time. Cloud Run's --set-build-env-vars arrive as
# Docker build-args, and a RUN step cannot see them unless they are declared.
# The CARTO key is dropped from the runtime environment after the bundle has it.
# Plans/API_KEY_SECURITY.md
ARG VITE_APP_URL
ARG VITE_CARTO_BASEMAP_KEY
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_CARTO_BASEMAP_KEY=$VITE_CARTO_BASEMAP_KEY

# Web build (absolute asset paths for Cloud Run)
RUN npm run build

ENV VITE_CARTO_BASEMAP_KEY=

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# firebase-applet-config.json should be present at deploy time (see .gcloudignore).
# DPIRD_API_KEY and optional FIREBASE_SERVICE_ACCOUNT_JSON via Cloud Run secrets.
CMD ["npx", "tsx", "server.ts"]
