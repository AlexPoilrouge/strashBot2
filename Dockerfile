# FROM alpine:latest
# FROM my_alpine:0.1
FROM archlinux:latest

#RUN apk add shadow bash gettext elogind-dev sudo

# COPY ./config /tmp/recieved/config
# COPY ./extras /tmp/recieved/extras
# COPY ./js /tmp/recieved/js
# COPY ./bot_main.js /tmp/recieved
# COPY ./package.json /tmp/recieved
# COPY ./version.txt /tmp/recieved
# COPY ./docker_build /tmp/recieved/docker_build
# COPY ./docker_build/values.txt /tmp/recieved
# COPY ./install.sh /tmp/recieved
# COPY ./launch.sh /tmp/recieved

# RUN apk add npm nodejs

RUN pacman-db-upgrade

RUN pacman -Syyu --noconfirm nodejs-lts-gallium gcc npm make openssh sudo git imagemagick

COPY . /tmp/recieved

WORKDIR /tmp/recieved

RUN echo "'docker_test/values.txt' must be provided…" && cp -vf docker_test/values.txt ./values.txt

RUN chmod u+x install.sh
RUN ./install.sh 

WORKDIR /var/app/strashBot

RUN echo "'docker_test/guildConfigs.json' must be provided…" && cp -vf /tmp/recieved/docker_test/guildConfigs.json data/

CMD "./launch.sh"
