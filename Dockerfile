FROM node:22-alpine

WORKDIR /usr/src/project/

COPY . .

RUN npm ci && \
    npm run build

CMD ["node", "dist/index.mjs"]
