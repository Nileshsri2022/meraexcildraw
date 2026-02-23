FROM node:18-slim

WORKDIR /app

COPY server/package.json ./
RUN npm install --production

COPY server/index.js ./index.js

EXPOSE 3002

CMD ["node", "index.js"]