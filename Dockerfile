FROM archlinux:latest

COPY ./docker/mirrorlist /etc/pacman.d/mirrorlist

RUN pacman-db-upgrade

RUN pacman -Syyu --noconfirm nodejs-lts-gallium gcc npm make openssh sudo nano git imagemagick openssh libssh2 boost-libs inkscape zip

COPY . /tmp/recieved
# COPY docker_test/postCmdTarget /tmp/recieved/js/postCmdTarget
# COPY docker_test/id_rsa /root/.ssh/id_rsa
# COPY docker_test/id_rsa.pub /root/.ssh/id_rsa.pub
# COPY docker_test/ssh_host /tmp/ssh_host
RUN echo "Add copy script as 'docker_test/copies.sh' if needed - " && ( bash /tmp/recieved/docker_test/copies.sh || echo 'none given' )

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
