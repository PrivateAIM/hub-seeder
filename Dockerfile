FROM node:24-alpine AS builder

WORKDIR /usr/src/project/

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Strip devDependencies so only the runtime deps remain in node_modules.
RUN npm prune --omit=dev

FROM node:24-alpine

WORKDIR /usr/src/project/

COPY --from=builder /usr/src/project/package.json ./package.json
COPY --from=builder /usr/src/project/node_modules ./node_modules
COPY --from=builder /usr/src/project/dist ./dist

ENTRYPOINT ["node", "dist/cli/index.mjs"]
