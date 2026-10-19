FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY app ./app
RUN mkdir -p /app/dados && chown node:node /app/dados
VOLUME /app/dados
ENV HOST=0.0.0.0 PORT=8787 NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "server/server.mjs"]
