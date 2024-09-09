# FROM alpine:latest
# FROM my_alpine:0.1
FROM archlinux:latest

COPY ./docker/mirrorlist /etc/pacman.d/mirrorlist

RUN pacman-db-upgrade

RUN pacman -Syyu --noconfirm \
                nodejs-lts-hydrogen \
                gcc \
                npm \
                python-setuptools \
                make \
                openssh \
                sudo \
                nano \
                git \
                imagemagick \
                openssh \
                libssh2 \
                boost-libs \
                inkscape \
                zip \
                unzip \
                wget

RUN mkdir -p /var/app/strashBot

COPY config /var/app/strashBot/config
COPY js /var/app/strashBot/js
COPY extras /var/app/strashBot/extras
COPY package.json install.sh kart.js /var/app/strashBot/

WORKDIR /var/app/strashBot

RUN echo "Add copy script as 'docker_test/copies.sh' if needed - " && \
    ( [ -f /var/app/strashBot/config/ansible/docker_test/copies.sh ] && \
        bash /var/app/strashBot/config/ansible/docker_test/copies.sh || \
        echo 'none given' )

RUN ssh-keyscan $( [ -f /tmp/ssh_host ] && head -n1 /tmp/ssh_host || echo "127.0.0.1" ) >> /root/.ssh/known_hosts || echo "no keys…"

ARG Register_Slash=""
ENV STRASHBOT_SLASH_REGISTER "${Register_Slash}"

RUN chmod u+x install.sh
RUN ./install.sh -d

CMD "./launch.sh"
