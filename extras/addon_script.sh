#!/bin/bash

echoerr() { echo "$@" 1>&2; }

SCRIPT_DIR="$( dirname "$( realpath "$0" )" )"
EXTENSIONS=(pk3 wad lua kart pk7)

ls_restricted() {
    for i in ${EXTENSIONS[@]}; do
        if [ "$2" != "" ]; then
            (ls $1/* | grep -i "$2" | grep -i ".${i}$") 2>/dev/null
        else
            (ls $1/* | grep -i ".${i}$") 2>/dev/null
        fi
    done
}

cd "${SCRIPT_DIR}"



TMP_FILE="tmp_load.cfg"
DL_FILE="dl_load.cfg"


_update(){
    echo "wait" > "${TMP_FILE}"
    ( ls_restricted tmp ) | while read -r L; do
            echo "addfile \"${L}\"" >> "${TMP_FILE}"
            echo "wait" >> "${TMP_FILE}"
        done

    echo "wait" > "${DL_FILE}"
    ( ls_restricted dl ) | while read -r L; do
            echo "addfile \"${L}\"" >> "${DL_FILE}"
            echo "wait" >> "${DL_FILE}"
        done
}

CFG_CMD_BLACKLIST=("addfile" "alias" "bind" "toggle" "changeconfig" "exec" "loadconfig" "runsoc" "saveconfig" "exitgame" "quit" "demote" "password" "promote" "connect" "cheats" "runscripts" "addons_folder" "addons_option" "addons_search_case" "addons_search_type" "maxsend")

_filter_cfg_cmd(){
    for i in ${CFG_CMD_BLACKLIST[@]}; do
        echo "$( sed "s/^\s*${i}/\/\/${i}/g" "$1" )" > "$1"
    done
}

CMD="UPDATE"

if [ "$1" != "" ]; then
    CMD="$1"
fi

case "$CMD" in
"INIT")
    mkdir -p tmp
    mkdir -p dl

    _update
;;
"CLEAN")
    for i in ${EXTENSIONS[@]}; do
        rm -rvf tmp/*.${i} 2>/dev/null
    done
;;
"LIST")
    _TEST=false
    echo "**[Temporary]**"
    _S=""
    _TMP="$( ( ls_restricted tmp "$2" ) | while read -r L; do echo -n "${_S}${L}"; _S=" ";_TEST=true; done )"
    if [ "${_TMP}" != "" ]; then _TEST=true; fi
    echo "${_TMP}"
    echo "**[Downloaded]**"
    _S=""
    _TMP="$( ( ls_restricted dl "$2" ) | while read -r L; do echo -n "${_S}${L}"; _S=" ";_TEST=true; done )"
    if [ "${_TMP}" != "" ]; then _TEST=true; fi
    echo "${_TMP}"
    echo "**[Base]**"
    _S=""
    _TMP="$( ( ls_restricted Packs "$2" ) | while read -r L; do echo -n "${_S}${L}"; _S=" ";_TEST=true; done )"
    if [ "${_TMP}" != "" ]; then _TEST=true; fi
    echo "${_TMP}"
    
    if ! "${_TEST}"; then exit 3; fi
;;
"REMOVE")
    if [ $# -ge 2 ]; then
        _DIR="$( dirname "$2" )"
        if [ "${_DIR}" = "dl" ] || [ "${_DIR}" = "tmp" ]; then
            if _RES="$( rm -v $2 2>/dev/null )"; then
                echo "$_RES"
            else
                echo "Unable to delete such file: \`$2\`…"
                exit 2
            fi
        elif _RES="$( ( rm -v dl/"$2" || rm -v tmp/"$2" ) 2>/dev/null )"; then
            echo "$_RES"
        else
            echo "Unable to delete such file: \`$2\`…"
            exit 2
        fi
    else
        echo "No given file to delete…"
        exit 2
    fi
;;
"KEEP")
    if [ $# -lt 2 ]; then
        echo "No addon given…"
        exit 4
    fi

    _DIR="tmp"
    _FILE="tmp/$2"
    if [ "$(dirname "$2" )" = "tmp" ]; then
        _FILE="tmp/$( basename "$2" )"
    fi

    if mv "$_FILE" dl/"$( basename $2 )"; then
        _update
        echo "$( basename $2 ) moved from **[Temporary]** to **[Downloaded]**"
    else
        echo "Unable to move such **[Temporary]** addon *$2*…"
        exit 5
    fi
;;
"GET_CONFIG")
    _CFG_FILE="startup.cfg"
    if [ -f "$_CFG_FILE" ]; then
        echo -n "$( realpath "$_CFG_FILE" )"
    else
        exit 6
    fi
;;
"CHANGE_CONFIG")
    if [ $# -lt 2 ]; then
        echo "No new .cfg given for update…"
        exit 7
    fi

    _CFG_FILE="startup.cfg"
    
    if ! [ -f "${2}" ]; then
        echo "Given .cfg ($2) doesn't seem to be a valid path…"
        exit 7
    fi

    _filter_cfg_cmd "$2"

    _DIFF_FILE="startup.cfg.diff"

    if [ -f "${_CFG_FILE}" ]; then
        diff -u "${_CFG_FILE}" "$2" > "${_DIFF_FILE}"

        echo -n "$( realpath ${_DIFF_FILE} )"
    else
        echo -n "updated"
    fi

    mv "${2}" "${_CFG_FILE}"
;;
"CFG_BLACKLIST")
    for i in ${CFG_CMD_BLACKLIST[@]}; do
        echo -n "\`$i\` "
    done
    echo ""
;;
"GET_LOG")
    _LOG_FILE="log.txt"
    if [ -f "${_LOG_FILE}" ]; then
        echo -n "$( realpath "${_LOG_FILE}" )"
    else
        exit 8
    fi
;;
"UPDATE")
    _update
;;
esac

exit 0