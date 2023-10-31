# FROM alpine:latest
# FROM my_alpine:0.1
FROM archlinux:latest

COPY ./docker/mirrorlist /etc/pacman.d/mirrorlist

RUN pacman-db-upgrade

RUN pacman -Syyu --noconfirm nodejs-lts-hydrogen gcc npm make openssh sudo nano git imagemagick openssh libssh2 boost-libs inkscape zip

COPY . /tmp/recieved

RUN echo "Add copy script as 'docker_test/copies.sh' if needed - " && \
    ( [ -f /tmp/recieved/docker_test/copies.sh ] && \
        bash /tmp/recieved/docker_test/copies.sh || \
        echo 'none given' )

WORKDIR /tmp/recieved

RUN ssh-keyscan $( [ -f /tmp/ssh_host ] && head -n1 /tmp/ssh_host || echo "127.0.0.1" ) >> /root/.ssh/known_hosts

RUN echo "'docker_test/values.txt' must be provided…" && cp -vf docker_test/values.txt ./values.txt

ARG Register_Slash=""
ENV STRASHBOT_SLASH_REGISTER "${Register_Slash}"

RUN chmod u+x install.sh
RUN ./install.sh 

WORKDIR /var/app/strashBot

RUN echo "'docker_test/guildConfigs.json' must be provided…" && cp -vf /tmp/recieved/docker_test/guildConfigs.json data/

CMD "./launch.sh"
