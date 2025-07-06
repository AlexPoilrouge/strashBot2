# FROM alpine:latest
# FROM my_alpine:0.1
FROM archlinux:latest

COPY ./docker/mirrorlist /etc/pacman.d/mirrorlist

RUN pacman-db-upgrade

RUN pacman -Syyu --noconfirm \
                nodejs-lts-jod \
                gcc \
                npm \
                python-setuptools \
                make \
                ansible \
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
                wget \
                yq

RUN mkdir -p /var/strashbot_source

COPY config /var/strashbot_source/config
COPY js /var/strashbot_source/js
COPY extras /var/strashbot_source/extras
COPY package.json install.sh bot_main.js tsconfig.json README.md \
    /var/strashbot_source/

WORKDIR /var/strashbot_source

RUN echo "Add copy script as 'docker_test/copies.sh' if needed - " && \
    ( [ -f /var/strashbot_source/config/ansible/docker_test/data/copies.sh ] && \
        bash /var/strashbot_source/config/ansible/docker_test/data/copies.sh || \
        echo 'none given' )

RUN ssh-keyscan $( [ -f /tmp/ssh_host ] && head -n1 /tmp/ssh_host || echo "127.0.0.1" ) >> /root/.ssh/known_hosts || echo "no keys…"

RUN chmod u+x install.sh
RUN ./install.sh -d -v /var/strashbot_source/config/ansible/docker_test/variables.yaml

WORKDIR /var/app/strashBot

CMD [ "./launch.sh" ]
