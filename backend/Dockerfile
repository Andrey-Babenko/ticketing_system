FROM node:22-slim
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
ENV NODE_ENV=production
EXPOSE 3000
CMD ["./entrypoint.sh"]
