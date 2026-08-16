FROM node:22-alpine

WORKDIR /app

# Separate layer for dependencies so `docker build` only reinstalls them
# when package.json/package-lock.json actually change, not on every
# source edit - the most common Docker caching trick there is.
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Uploaded files need somewhere to live that survives an image rebuild -
# docker-compose.yml mounts a named volume at this path.
RUN mkdir -p uploads && chown -R node:node /app

# The official image already creates a non-root "node" user - running as
# it instead of root is the same defense-in-depth reasoning as this app's
# other security choices (Helmet, mongo-sanitize, bcrypt, etc.).
USER node

EXPOSE 5001

# Reuses the exact liveness endpoint built in Phase 1 for manual
# verification - Docker's own healthcheck is just another consumer of it.
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:5001/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
