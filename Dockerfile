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

# Cloud Run's --set-build-env-vars are not forwarded into `docker build`, so the
# CARTO key arrives as .carto-basemap-key, written by scripts/deploy-cloudrun.mjs
# and gitignored. Vite inlines it, then this step deletes the file. The running
# container does not keep it. Plans/API_KEY_SECURITY.md
ARG VITE_APP_URL
ENV VITE_APP_URL=$VITE_APP_URL
RUN CARTO_KEY="$(cat .carto-basemap-key 2>/dev/null || true)" \
 && rm -f .carto-basemap-key \
 && VITE_CARTO_BASEMAP_KEY="$CARTO_KEY" npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# firebase-applet-config.json should be present at deploy time (see .gcloudignore).
# DPIRD_API_KEY and optional FIREBASE_SERVICE_ACCOUNT_JSON via Cloud Run secrets.
CMD ["npx", "tsx", "server.ts"]
