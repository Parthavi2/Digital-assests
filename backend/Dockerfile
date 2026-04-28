FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl ffmpeg

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY uploads ./uploads

EXPOSE 5000

CMD ["npm", "start"]
