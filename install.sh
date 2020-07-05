#!/bin/bash

echoerr() { echo "$@" 1>&2; }

depend_check() {
    for arg; do
		hash "$arg" 2>/dev/null || { echoerr "Error: Could not find \"$arg\" application."; exit 2; }
    done    
}

SCRIPT_DIR="$( realpath "$( dirname "$0" )" )"

cd "$SCRIPT_DIR"

ROOT_DIR="/"
if [ "$#" -gt 0 ] && [ -d "$1" ]; then
    ROOT_DIR="$1"
fi

echo "Root dir is set to ${ROOT_DIR}"




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


check_val(){
    if [ "${!1}" = "" ]; then
        echoerr "Variable $1 not set…"
        exit 3
    fi
}


while read -r VAR_LINE; do
    if [[ "${VAR_LINE}" =~ ^[0-9a-zA-Z_]+\:.*$ ]]; then
        VAR="$( echo "${VAR_LINE}" | cut -d: -f1 )"
        VAL="$( echo "${VAR_LINE}" | cut -d: -f2- )"
    	
        if eval [ -x '${'"${VAR}"'+x}' ]; then
            echoerr "export \"${VAR}\"=\"${VAL}\""
            eval "export \"${VAR}\"=\"${VAL}\""
        else
            echoerr "[WARNING] Variable '${VAR}' was already set; ignoring value in '${VALUES_FILE}'"
            eval export "${VAR}"
    	fi
    else
    	echoerr "[CRITICAL WARNING] In '${VALUES_FILE}', line '${VAR_LINE}' is invalid."
    fi
done < "${VALUES_FILE}"

if [ -z "${STRASHBOT_DISCORD_BUILD}" ]; then
    STRASHBOT_DISCORD_BUILD="$( git branch --show-current  2>/dev/null )"
fi
if [ "${STRASHBOT_DISCORD_BUILD}" == "" ]; then
    STRASHBOT_DISCORD_BUILD="custom"
fi
export STRASHBOT_DISCORD_BUILD



##### Obtaining and formating files #####

check_template(){
    if ! [ -f "${1}.template" ]; then
        echoerr "Missing template file for $1 ( ${1}.template )"
        exit 4
    fi
}


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

mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}"
mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}/config"
find ./config -type f -exec install {} "${ROOT_DIR}/${STRASHBOT_DIR}/config" \;
mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}/extras"
find ./extras -type f -exec install {} "${ROOT_DIR}/${STRASHBOT_DIR}/extras" \;
mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}/js/commands"
find ./js -type f -exec install {} "${ROOT_DIR}/${STRASHBOT_DIR}/{}" \;
install ./bot_main.js ./README.md ./package.json ./version.txt "${ROOT_DIR}/${STRASHBOT_DIR}"

mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}/js/commands/data"
install extras/kart.json "${ROOT_DIR}/${STRASHBOT_DIR}/js/commands/data"

if "${SYSTEMD_INSTALL}"; then
    mkdir -p "${ROOT_DIR}/${SERVICE_INSTALL_PATH}"
    install extras/strashbot.service "${ROOT_DIR}/${SERVICE_INSTALL_PATH}" -m 644

    install extras/srb2kart_serv.service "${ROOT_DIR}/${SERVICE_INSTALL_PATH}" -m 644

    mkdir -p "${ROOT_DIR}/${SUDOERS_DIR}"
    install extras/10-strashbot-kartserv-systemd "${ROOT_DIR}/${SUDOERS_DIR}" -m 644
fi

install extras/launch.sh "${ROOT_DIR}/${STRASHBOT_DIR}"

GUILD_CONFIG_FILE="${ROOT_DIR}/${STRASHBOT_DIR}/data/guildConfigs.json"
echoerr "gcf= ${GUILD_CONFIG_FILE}"
if ! [ -f "${GUILD_CONFIG_FILE}" ] || [ "$( cat "${GUILD_CONFIG_FILE}" )" == "" ]; then
    echo "{}" > "${GUILD_CONFIG_FILE}"
    echoerr "echo \"{}\" > \"${GUILD_CONFIG_FILE}\""
fi

chown -R "${STRASHBOT_USER}:${STRASHBOT_USER}" "${ROOT_DIR}/${STRASHBOT_DIR}"

cd "${ROOT_DIR}/${STRASHBOT_DIR}"

npm install
