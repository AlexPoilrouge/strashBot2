#!/bin/bash

echoerr() { echo "$@" 1>&2; }

SCRIPT_DIR="$( dirname "$( realpath "$0" )" )"

MC_DIR="/opt/minecraft-bedrock-server"

ALLOWLIST_FILE="${MC_DIR}/allowlist.json"

MC_USER_GRP="minecraft-bedrock:minecraft-bedrock"


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
*)
    echo "ERROR - Invalid $0 command…"
    exit 999
;;
esac

exit 0
