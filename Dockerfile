# FROM alpine:latest
FROM my_alpine:0.1

#RUN apk add shadow bash gettext elogind-dev sudo

COPY ./config /tmp/recieved/config
COPY ./extras /tmp/recieved/extras
COPY ./js /tmp/recieved/js
COPY ./bot_main.js /tmp/recieved
COPY ./package.json /tmp/recieved
COPY ./version.txt /tmp/recieved
COPY ./docker_build /tmp/recieved/docker_build
COPY ./docker_build/values.txt /tmp/recieved
COPY ./install.sh /tmp/recieved
COPY ./launch.sh /tmp/recieved

# RUN apk add npm nodejs

WORKDIR /tmp/recieved

RUN chmod u+x install.sh
RUN ./install.sh

RUN cp ./docker_build/srb2k_serv /etc/init.d

WORKDIR /var/app/strashBot

CMD "./launch.sh"
