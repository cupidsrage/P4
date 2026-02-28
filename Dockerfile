FROM node:22-alpine

WORKDIR /app
COPY . /app

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
