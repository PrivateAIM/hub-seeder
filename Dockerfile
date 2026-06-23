FROM node:24-alpine

WORKDIR /usr/src/project/

COPY . .

RUN npm ci && \
    npm run build

ENTRYPOINT ["node", "dist/cli/index.mjs"]
