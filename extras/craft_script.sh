#!/bin/bash

echoerr() { echo "$@" 1>&2; }

SCRIPT_DIR="$( dirname "$( realpath "$0" )" )"

MC_DIR="/opt/minecraft-bedrock-server"

ALLOWLIST_FILE="${MC_DIR}/allowlist.json"

MC_USER_GRP="minecraft-bedrock:minecraft-bedrock"

MC_SERVER_DL_BASE_URL="https://minecraft.azureedge.net/bin-linux"
MC_SERVER_FILE_BASE_NAME="bedrock-server"
MC_SERVER_NOUPDATE_FILE="${SCRIPT_DIR}/mc_no_update.lst"

UPDATE_LOCKFILE="${SCRIPT_DIR}/update.lock"


isServUpdateLock() {
    if [ ! -f "${UPDATE_LOCKFILE}" ] ||
       [ "$(( "$( date +"%s" )" - "$( cat "${UPDATE_LOCKFILE}" )" ))" -gt "600" ] ;
    then
        return 1
    else
        return 0
    fi
}


cd "${SCRIPT_DIR}"


CMD=""

if [ "$1" != "" ]; then
    CMD="$1"
fi

shift

case "$CMD" in
"UPDATE_JOIN")
    SRC_FILE="$1"

    mv -f "${ALLOWLIST_FILE}" "${ALLOWLIST_FILE}.bak"
    cp -f "${SRC_FILE}" "${ALLOWLIST_FILE}"

    chown "${MC_USER_GRP}" "${ALLOWLIST_FILE}"

    exit 0
;;
"SERVER_UPDATE")
    VERSION="$1"
    SERV_ZIP_FILE_NAME="${MC_SERVER_FILE_BASE_NAME}-${VERSION}.zip"
    COMPLETE_URL="${MC_SERVER_DL_BASE_URL}/${SERV_ZIP_FILE_NAME}"

    clean_update(){
        rm -rf ${MC_SERVER_FILE_BASE_NAME}*.zip* "${UPDATE_LOCKFILE}"
    }

    if ! isServUpdateLock; then
        echo "$( date +"%s" )" > "${UPDATE_LOCKFILE}"
        if wget "${COMPLETE_URL}" -P "${SCRIPT_DIR}" &> "${SCRIPT_DIR}/update.log"; then
            if unzip -o "${SCRIPT_DIR}/${SERV_ZIP_FILE_NAME}" -x $(<${MC_SERVER_NOUPDATE_FILE}) -d "${MC_DIR}" &> "${SCRIPT_DIR}/update_install.log"; 
            then
                echo "${VERSION}" > "${MC_DIR}/version.txt"
                chown -Rf "${MC_USER_GRP}" "${MC_DIR}"
                clean_update
                exit 0
            else
                clean_update
                exit 2
            fi
        else
            clean_update
            exit 1
        fi
    else
        exit 3
    fi
;;
*)
    echo "ERROR - Invalid $0 command…"
    exit 999
;;
esac

exit 0
