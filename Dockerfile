FROM alpine:latest

COPY . /opt/strashbot

RUN apk --no-cache add npm nodejs

WORKDIR /opt/strashbot

RUN npm install

CMD node bot_main.js
