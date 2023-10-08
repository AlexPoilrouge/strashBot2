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

depend_check "convert"




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

if [ -d .git ] && git rev-parse --git-dir > /dev/null 2>&1; then
    STRASHBOT_DISCORD_BUILD="$( git branch --show-current  2>/dev/null )"
fi
if [ "${STRASHBOT_DISCORD_BUILD}" == "" ]; then
    STRASHBOT_DISCORD_BUILD="custom"
fi
export STRASHBOT_DISCORD_BUILD

if [ -f "version.txt" ]; then
    STRASHBOT_DISCORD_VER="$(head -n 1 version.txt)"
    export STRASHBOT_DISCORD_VER
fi



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
install_file(){
    FILE="$1"
    TARGET_FILE="$2"

    mkdir -p "$(dirname ${TARGET_FILE})"
    install "${FILE}" "${TARGET_FILE}"
}
export -f install_file

if [ "$(grep -c "^${STRASHBOT_USER}:" /etc/passwd)" -eq 0 ]; then
    useradd -m "${STRASHBOT_USER}"
fi

mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}"
mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}/config"
find ./config -type f -exec install {} "${ROOT_DIR}/${STRASHBOT_DIR}/config" \;
mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}/extras"
find ./extras -type f -exec install {} "${ROOT_DIR}/${STRASHBOT_DIR}/extras" \;
mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}/js/{commands,modules}"
mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}/js/postCmdTarget"
find ./js -type f -exec bash -c 'install_file "$0" "$1"' {} "${ROOT_DIR}/${STRASHBOT_DIR}/{}" \;
install ./bot_main.js ./README.md ./package.json ./version.txt "${ROOT_DIR}/${STRASHBOT_DIR}"

mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}/js/modules/data"
install extras/{kart.json,craft.json} "${ROOT_DIR}/${STRASHBOT_DIR}/js/modules/data"

mkdir -p "${ROOT_DIR}/${STRASHBOT_DIR}/js/modules/top8gen/smashgg"
install extras/smashgg_infos.json "${ROOT_DIR}/${STRASHBOT_DIR}/js/modules/top8gen/smashgg"

if "${SYSTEMD_INSTALL}"; then
    mkdir -p "${ROOT_DIR}/${SERVICE_INSTALL_PATH}"
    install extras/strashbot.service "${ROOT_DIR}/${SERVICE_INSTALL_PATH}" -m 644

    install extras/srb2kart_serv.service "${ROOT_DIR}/${SERVICE_INSTALL_PATH}" -m 644

    mkdir -p "${ROOT_DIR}/${SUDOERS_DIR}"
    install extras/{10-strashbot-kartserv-systemd,10-strashbot-craft-ctrl} "${ROOT_DIR}/${SUDOERS_DIR}" -m 644

    systemctl daemon-reload
fi

install extras/launch.sh "${ROOT_DIR}/${STRASHBOT_DIR}"

GUILD_CONFIG_FILE="${ROOT_DIR}/${STRASHBOT_DIR}/data/guildConfigs.json"
echoerr "gcf= ${GUILD_CONFIG_FILE}"
if ! [ -f "${GUILD_CONFIG_FILE}" ] || [ "$( cat "${GUILD_CONFIG_FILE}" )" == "" ]; then
    mkdir -p "$( realpath "$( dirname "${GUILD_CONFIG_FILE}" )" )"
    echo "{}" > "${GUILD_CONFIG_FILE}"
    echoerr "echo \"{}\" > \"${GUILD_CONFIG_FILE}\""
fi

install extras/{record_lmp_read.py,server_script.sh,addon_script.sh} "${ROOT_DIR}/home/${STRASHBOT_USER}/${SRB2KART_DIR}"
chown -R "${STRASHBOT_USER}:${STRASHBOT_USER}" "${ROOT_DIR}/${STRASHBOT_DIR}"

mkdir -p "${ROOT_DIR}/home/${STRASHBOT_USER}/${CRAFT_DIR}"
install extras/craft_script.sh "${ROOT_DIR}/home/${STRASHBOT_USER}/${CRAFT_DIR}"
chown -R "${STRASHBOT_USER}:${STRASHBOT_USER}" "${ROOT_DIR}/home/${STRASHBOT_USER}/${CRAFT_DIR}"

cd "${ROOT_DIR}/${STRASHBOT_DIR}"

npm install

export SLASH_REGISTER="$( [ -n "$1" ] && echo "$1" || echo "${STRASHBOT_SLASH_REGISTER}" )"

if "${SLASH_REGISTER}"; then
    _NODE_CONFIG_DIR="${NODE_CONFIG_DIR}"
    export NODE_CONFIG_DIR="$( realpath "${ROOT_DIR}/${STRASHBOT_DIR}/config" )"
    export STRASHBOT_CLIENTID="${STRASHBOT_DISCORD_CLIENT_ID}"
    export STRASHBOT_TOKEN="${STRASHBOT_DISCORD_TOKEN}"
    export STRASHBOT_DEVGUILDID="${STRASHBOT_DEV_GUILD}"
    export STRASHBOT_DEBUG="${STRASHBOT_DISCORD_DEBUG}"

    echo "Registering slash dev commands…"
    echo "    (NODE_CONFIG_DIR=\"${NODE_CONFIG_DIR}\")}"
    node js/registerSlash.js

    export NODE_CONFIG_DIR="${_NODE_CONFIG_DIR}"
else
    echo "Not registering new slash dev commands…"
fi

if "${SYSTEMD_INSTALL}" && (systemctl is-active strashbot.service); then
    systemctl restart strashbot.service
fi
