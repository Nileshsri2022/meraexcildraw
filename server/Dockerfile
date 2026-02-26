FROM node:18-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install --production

# Copy server code
COPY index.js ./index.js

# Copy .env if it exists (Railway env vars take priority)
COPY .env* ./

# Railway provides PORT env var
EXPOSE 3002

CMD ["node", "index.js"]