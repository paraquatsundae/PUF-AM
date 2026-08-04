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

# Web build (absolute asset paths for Cloud Run)
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# firebase-applet-config.json should be present at deploy time (see .gcloudignore).
# DPIRD_API_KEY and optional FIREBASE_SERVICE_ACCOUNT_JSON via Cloud Run secrets.
CMD ["npx", "tsx", "server.ts"]
