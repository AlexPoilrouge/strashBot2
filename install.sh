#!/bin/bash

echoerr() { echo "$@" 1>&2; }

depend_check() {
    for arg; do
		hash "$arg" 2>/dev/null || { echoerr "Error: Could not find \"$arg\" application."; exit 2; }
    done    
}

SCRIPT_DIR="$( realpath "$( dirname "$0" )" )"

cd "$SCRIPT_DIR"


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


ANSIBLE_DIR="${SCRIPT_DIR}/config/ansible"
VARIABLES_YAML="${ANSIBLE_DIR}/variables.yaml"
MAKE_OPT=""

OPTIONS=$(getopt -o dhv:m: --long docker_testing,help,variables_file:,make_opt: -- "$@")

eval set -- "${OPTIONS}"
# Process the options
while true; do
    case "$1" in
        -d | --docker_testing ) MAKE_OPT="${MAKE_OPT} ANSIBLE_DOCKER_TEST_FLAG=true"; shift ;;
        -v | --variables_file )
              VARIABLES_YAML="$2"
              shift 2
              ;;
        -m | --make_opt)
              MAKE_OPT="${MAKE_OPT} $2"
              shift 2
              ;;
        -h | --help ) usage; shift;;
        -- ) shift; break ;;
        * ) break ;;
    esac
done


eval make -C "${ANSIBLE_DIR}" local_install LOCAL_SOURCE_DIR="${SCRIPT_DIR}" ANSIBLE_VARIABLES="${VARIABLES_YAML}" "${MAKE_OPT}"


# ANSIBLE_ROOT_DIR="$( yq '.root_dir' "${VARIABLES_YAML}" | tr -d '"' )"
# ANSIBLE_INSTALL_DIR="$( yq '.install_dir' "${VARIABLES_YAML}" | tr -d '"' )"
# INSTALL_DIR="$( realpath "${ANSIBLE_ROOT_DIR}/${ANSIBLE_INSTALL_DIR}" )"

# STRASHBOT_USER="$( yq '.strashbot.username' "${VARIABLES_YAML}" | tr -d '"' )"

echo "End."

