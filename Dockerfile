FROM node:24-alpine AS builder

WORKDIR /usr/src/project/

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine

WORKDIR /usr/src/project/

COPY --from=builder /usr/src/project/dist ./dist

ENTRYPOINT ["node", "dist/cli/index.mjs"]
