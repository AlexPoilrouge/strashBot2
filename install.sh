#!/bin/bash

echoerr() { echo "$@" 1>&2; }

depend_check() {
    for arg; do
		hash "$arg" 2>/dev/null || { echoerr "Error: Could not find \"$arg\" application."; exit 2; }
    done    
}

SCRIPT_DIR="$( realpath "$( dirname "$0" )" )"

cd "$SCRIPT_DIR"

INSTALL_DIR="/"
if [ "$#" -gt 0 ] && [ -d "$1" ]; then
    INSTALL_DIR="$1"
fi

echo "Install dir is ${INSTALL_DIR}"




if ! [ "$( id -u )" = 0 ]; then
   echo "$0 must be run with root privileges…"
   exit 1
fi

depend_check "sudo"
depend_check "node"
depend_check "npm"
depend_check "find"
depend_check "useradd"
depend_check "envsubst"




##### Obtaining variable values #####

VALUES_FILE="values.txt"

VARIABLES=(STRASHBOT_USER STRASHBOT_DIR SERVICE_INSTALL_PATH SRB2KART_DIR STRASHBOT_DISCORD_TOKEN STRASBHOT_MASTER_DIRCORD_ID SUDOERS_DIR)


extract_value(){
    _VAL="$1"
    grep "${_VAL}" "${VALUES_FILE}" | cut -d: -f2-
}

check_val(){
    if [ "${!1}" = "" ]; then
        echoerr "Variable $1 not set…"
        exit 3
    fi
}

for VAR in ${VARIABLES[@]}; do
    if eval [ -x '${'"${VAR}"'+x}' ]; then
        eval export "${VAR}"="$( extract_value ${VAR} )"
    else
        eval export "${VAR}"
    fi
    check_val "${VAR}"
done




##### Obtaining and formating files #####

TARGET_FILES=("extras/kart.json" "extras/srb2kart_serv.service" "extras/strashbot.service" "extras/10-strashbot-kartserv-systemd" "extras/launch.sh" \
"docker_build/srb2k_serv")

check_template(){
    if ! [ -f "${1}.template" ]; then
        echoerr "Missing template file for $1 ( ${1}.template )"
        exit 4
    fi
}

# for FILES in ${TARGET_FILES[@]}; do
#     check_template "${FILES}"
#     envsubst < "${FILES}.template" > "${FILES}"
# done

convert_template(){
    echo -n "-- formatting '$1'"
    TEMPLATE_FILE="$1"
    if [[ "${TEMPLATE_FILE}" =~ .*\.template$ ]]; then
        TARGET_FILE="${TEMPLATE_FILE%.*}"
        check_template "${TARGET_FILE}"
        envsubst < "${TEMPLATE_FILE}" > "${TARGET_FILE}"
        echo " -> ${TARGET_FILE}"
    else
        echo " -> ! ERROR !"
    fi
}
export -f check_template
export -f convert_template

find . -regex '.*\.template$' -exec bash -c 'convert_template {}' \;




##### install #####

if [ "$(grep -c "^${STRASHBOT_USER}:" /etc/passwd)" -eq 0 ]; then
    useradd -m -s /usr/bin/nologin "${STRASHBOT_USER}"
fi

mkdir -p "${INSTALL_DIR}/${STRASHBOT_DIR}"
mkdir -p "${INSTALL_DIR}/${STRASHBOT_DIR}/config"
find ./config -type f -exec install {} "${INSTALL_DIR}/${STRASHBOT_DIR}/config" \;
mkdir -p "${INSTALL_DIR}/${STRASHBOT_DIR}/extras"
find ./extras -type f -exec install {} "${INSTALL_DIR}/${STRASHBOT_DIR}/extras" \;
mkdir -p "${INSTALL_DIR}/${STRASHBOT_DIR}/js"
find ./js -type f -exec install {} "${INSTALL_DIR}/${STRASHBOT_DIR}/js" \;
install ./bot_main.js ./README.md ./package.json ./version.txt "${INSTALL_DIR}/${STRASHBOT_DIR}"

mkdir -p "${INSTALL_DIR}/${STRASHBOT_DIR}/js/commands/data"
install extras/kart.json "${INSTALL_DIR}/${STRASHBOT_DIR}/js/commands/data"

if "${SYSTEMD_INSTALL}"; then
    mkdir -p "${INSTALL_DIR}/${SERVICE_INSTALL_PATH}"
    install extras/strashbot.service "${INSTALL_DIR}/${SERVICE_INSTALL_PATH}" -m 644

    install extras/srb2kart_serv.service "${INSTALL_DIR}/${SERVICE_INSTALL_PATH}" -m 644

    mkdir -p "${INSTALL_DIR}/${SUDOERS_DIR}"
    install extras/10-strashbot-kartserv-systemd "${INSTALL_DIR}/${SUDOERS_DIR}" -m 644
fi

install extras/launch.sh "${INSTALL_DIR}/${STRASHBOT_DIR}"

chown -R "${STRASHBOT_USER}:${STRASHBOT_USER}" "${INSTALL_DIR}/${STRASHBOT_DIR}"

cd "${INSTALL_DIR}/${STRASHBOT_DIR}"

npm install
