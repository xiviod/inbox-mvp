FROM node:18-bullseye-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY .env.example ./.env.example

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]

