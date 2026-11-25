# ---------- build ----------
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY . .
RUN npm ci && npm run build && npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 4000
# Apply pending migrations, then start the API (which also serves the built frontend).
CMD ["sh", "-c", "npm run db:deploy && npm start"]
