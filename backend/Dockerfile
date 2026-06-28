# syntax=docker/dockerfile:1
# MoreMagic backend — Node 22, tini as PID 1, non-root, paper-first day trader.
FROM node:22-alpine AS base
RUN apk add --no-cache tini
WORKDIR /app

# Install production deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Drop privileges.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

# tini reaps zombies + forwards signals so SIGTERM shuts the loop down cleanly.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
