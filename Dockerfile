FROM archlinux:latest

COPY ./docker/mirrorlist /etc/pacman.d/mirrorlist

RUN pacman-db-upgrade

RUN pacman -Syyu --noconfirm nodejs-lts-gallium gcc npm make openssh sudo nano git imagemagick

COPY . /tmp/recieved
COPY docker_test/postCmdTarget /tmp/recieved/js/postCmdTarget

WORKDIR /tmp/recieved

RUN echo "'docker_test/values.txt' must be provided…" && cp -vf docker_test/values.txt ./values.txt

RUN chmod u+x install.sh
RUN ./install.sh 

WORKDIR /var/app/strashBot

RUN echo "'docker_test/guildConfigs.json' must be provided…" && cp -vf /tmp/recieved/docker_test/guildConfigs.json data/

CMD "./launch.sh"
