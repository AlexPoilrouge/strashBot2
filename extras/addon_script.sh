#!/bin/bash

echoerr() { echo "$@" 1>&2; }

SCRIPT_DIR="$( dirname "$( realpath "$0" )" )"
EXTENSIONS=(pk3 wad lua kart pk7)

PYTHON_LMP_ATTACK_SCRIPT="record_lmp_read.py"

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
            chmod 704 "${L}"
            echo "addfile \"${L}\"" >> "${TMP_FILE}"
            echo "wait" >> "${TMP_FILE}"
        done

    echo "wait" > "${DL_FILE}"
    ( ls_restricted dl ) | while read -r L; do
            chmod 704 "${L}"
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

    mkdir -p maps

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
"RECORD_MAPS")
    if ! [ -f "${PYTHON_LMP_ATTACK_SCRIPT}" ]; then
        echo "ERROR - internal error (no lmp eval func)"
        exit 9
    fi

    PATTERN=""
    LISTING=true
    if [ "$#" -gt 1 ]; then
        MAPNAME="$( _I=0; for _E in $@; do if [ "$_I" -gt 1 ]; then echo -n " "; fi ; if [ "$_I" -gt 0 ]; then echo -n "$_E"; fi; ((_I++)); done )"
        MAP_DIR="$( echo ${MAPNAME// /_} | tr '[:lower:]' '[:upper:]' )"
        NB_MATCH="$( ls -d1 maps/*/ 2>/dev/null | grep -i "${MAP_DIR}" | wc -l )"
        if ! [ -d "maps/$2" ] && [  "${NB_MATCH}" -gt 1 ]; then
            PATTERN="$2"
        elif [ "${NB_MATCH}" -eq 1 ]; then
            LISTING=false
        else
            echo "ERROR - No matching match found for records…"
            exit 10
        fi    
    fi

    if ${LISTING}; then
        if ! [ -d "maps" ]; then
            mkdir -p maps
        fi 
        
        ( ( if [ "$PATTERN" != "" ]; then ls -d1 maps/*/ 2>/dev/null | grep -i "${PATTERN}"; else ls -d1 maps/*/ 2>/dev/null; fi ) \
                | sed -e 's/^maps\///g' | sed 's/\///g'
           ) | while read -r L; do
            RECORD="\`no record\`"
            if [ -f "maps/${L}/record.txt" ]; then
                RECORD="$( sed '2q;d' "maps/${L}/record.txt" )"
                if [ "$RECORD" == "" ]; then
                    RECORD="\`no record\`"
                fi
            fi
            echo "${L} - **record:** ${RECORD} - $( (ls -1 "maps/${L}/"*.lmp 2>/dev/null ) | wc -l ) times"
        done

        exit 0
    else
        echo "=== ${MAP_DIR} ==="
        ( python "${PYTHON_LMP_ATTACK_SCRIPT}" "maps/${MAP_DIR}" | tr '\0' ' ' ) |  while read -r REC; do
            REC="${REC// /_}"
            REC_TAB=(${REC//::::/ })

            if [ "${REC_TAB[0]}" == "" ]; then
                echo "ERROR"
            else
                echo "${REC_TAB[0]} - ${REC_TAB[1]//_/ }"
                if [ "${REC_TAB[0]}" == "SUCCESS" ]; then
                    #echo "${REC_TAB[2]//_/ }"
                    echo "${REC_TAB[13]}"
                    echo "${REC_TAB[7]}"
                    echo "${REC_TAB[8]}"
                    _CHARACTER="${REC_TAB[9]}"
                    echo -n "$( echo ${_CHARACTER:0:1} | tr '[:lower:]' '[:upper:]' )$( echo ${_CHARACTER:1} )"
                    echo " ($( echo "${REC_TAB[10]}" | tr '[:upper:]' '[:lower:]' ))"
                    echo "${REC_TAB[11]} ${REC_TAB[12]}"
                    echo "SRB2Kart ${REC_TAB[3]}"
                    _NB_ADDONS="${REC_TAB[4]}"
                    echo -n "[ ${_NB_ADDONS} ]"
                    if [ "${_NB_ADDONS}" -gt 0 ]; then
                        echo "${REC_TAB[5]}" | tr ';' ' '
                    else
                        echo ""
                    fi
                fi
            fi
            echo "---"
        done
        exit 0
    fi
;;
"ADD_RECORD")
    if [ "$#" -lt 2 ]; then
        echo "ERROR - File map not provided"
        exit 11
    elif ! [ -f "$2" ]; then
        echo "ERROR - Non existing file map"
        exit 12
    elif [ "$#" -lt 3 ]; then
        echo "ERROR - Need to provided a tag for file renaming"
        exit 13
    fi

    REC="$( python "${PYTHON_LMP_ATTACK_SCRIPT}" "$2" )"
    REC_TAB=(${REC//::::/ })

    if [ "${REC_TAB[0]}" != "SUCCESS" ]; then
        echo "${REC_TAB[0]} - ${REC_TAB[1]}"
        exit 14
    elif [ "${REC_TAB[7]}" == "unfinished" ]; then
        echo "ERROR - Will only add completed track runs…"
        exit 15
    fi

    MAP_DIR="${REC_TAB[2]// /_}"
    mkdir -p "maps/${MAP_DIR}"

    if ! cp "${2}" "maps/${MAP_DIR}/$3.lmp"; then
        echo "ERROR - Can't add .lmp file"
        exit 16
    fi

    _RECORD_FILE="maps/${MAP_DIR}/record.txt"
    if ! [ -f "${_RECORD_FILE}" ] || [ "$( sed '1q;d' "${_RECORD_FILE}" )" -gt "${REC_TAB[6]}" ]; then
            echoerr "### ${_RECORD_FILE}"
            echo "${REC_TAB[6]}" > "${_RECORD_FILE}"
            echo "${REC_TAB[7]} by ${REC_TAB[8]} from $3" >> "${_RECORD_FILE}"

            echo "ADDED - New record! ${REC_TAB[7]}"
    else
        echo "ADDED - Record held: $( sed '2q;d' "${_RECORD_FILE}" )"
    fi

    exit 0
;;
"RECORD_GET")
    if [ "$#" -lt 2 ]; then
        echo "ERROR - Need  mapname"
        exit 17
    fi

    MAPNAME="$( _I=0; for _E in $@; do if [ "$_I" -gt 1 ]; then echo -n " "; fi ; if [ "$_I" -gt 0 ]; then echo -n "$_E"; fi; ((_I++)); done )"
    MAP_DIR="$( echo ${MAPNAME// /_} | tr '[:lower:]' '[:upper:]' )"

    if ! [ -d "maps/${MAP_DIR}" ] || [ "$( ls -1  "maps/${MAP_DIR}/"*.lmp 2>/dev/null | wc -l )" -lt 1 ]; then
        echo "ERROR - Can't find requested record…"
        exit 18
    fi

    _TMP="$( ls "maps/${MAP_DIR}/"*.lmp 2>/dev/null | grep -m1 .lmp )"
    _TMP="$( python "${PYTHON_LMP_ATTACK_SCRIPT}" "${_TMP}")"
    _TMP=(${_TMP//::::/ })
    _TMP="${_TMP[14]}"
    echo "To challenge a ghost from this archives, copy the .lmp file into the subfolder /replay/kart of your srb2kart folder,\
and rename the file '${_TMP}-guest.lmp'."        > README.txt
    _ZIP="${MAP_DIR}_record.zip"
    rm -rf "${_ZIP}" 2>/dev/null
    zip "${_ZIP}" README.txt >/dev/null 2>&1

    _C=0
    ( ls -1  "maps/${MAP_DIR}/"*.lmp 2>/dev/null ) |  while read -r F; do
        _PF="$( realpath "${F}" )"
        REC="$( python "${PYTHON_LMP_ATTACK_SCRIPT}" "${_PF}" | tr '\0' ' ' )"
        REC="${REC// /_}"
        REC_TAB=(${REC//::::/ })

        _RECORD_FILE="maps/${MAP_DIR}/record.txt"
        NEW_NAME="${REC_TAB[14]}-guest-${REC_TAB[8]}"
        if [ -f "${_RECORD_FILE}" ] && [ "${REC_TAB[6]}" -eq "$( sed '1q;d' "${_RECORD_FILE}" )" ]; then
            NEW_NAME="${NEW_NAME}-BEST"
        fi
        NEW_NAME="${NEW_NAME}.lmp"

        cp "${_PF}" "${NEW_NAME}"
        zip -ur "${_ZIP}" "${NEW_NAME}" >/dev/null 2>&1
        rm -f "${NEW_NAME}"

        ((_C++))
    done

    echo "ZIPPED - $( realpath "${_ZIP}" )"
    exit 0
;;
"RECORD_RM")
    if [ "$#" -lt 3 ]; then
        echo "ERROR - Need player tagname and mapname"
        exit 19
    fi

    TAGNAME="$2"
    MAPNAME="$( _I=0; for _E in $@; do if [ "$_I" -gt 2 ]; then echo -n " "; fi ; if [ "$_I" -gt 1 ]; then echo -n "$_E"; fi; ((_I++)); done )"
    MAP_DIR="$( echo ${MAPNAME// /_} | tr '[:lower:]' '[:upper:]' )"

    if ! [ -f "maps/${MAP_DIR}/${TAGNAME}.lmp" ]; then
        echo "ERROR - Can't find requested record…"
        exit 20
    fi

    if ! rm -f "maps/${MAP_DIR}/${TAGNAME}.lmp"; then
        echo "ERROR - Can't remove record…"
        exit 21
    fi

    if [ "$( (ls -1  "maps/${MAP_DIR}/"*.lmp 2>/dev/null) | wc -l )" -le 0 ]; then
        rm -rf "maps/${MAP_DIR}"
    else
        _C=0
        ( ls -1  "maps/${MAP_DIR}/"*.lmp 2>/dev/null ) |  while read -r F; do
            _PF="$( realpath "${F}" )"
            REC=$( python "${PYTHON_LMP_ATTACK_SCRIPT}" "${_PF}" | tr '\0' ' ' )
            REC="${REC// /_}"
            REC_TAB=(${REC//::::/ })
            T_REC=4294967295

            if [ "${REC_TAB[0]}" == "SUCCESS" ]; then
                if [ "${REC_TAB[6]}" -lt "${T_REC}" ]; then
                    _RECORD_FILE="maps/${MAP_DIR}/record.txt"
                    T_REC="${REC_TAB[6]}"
                    echo "${T_REC}" > "${_RECORD_FILE}"
                    _BF="$( basename "${F}" )"
                    echo "${REC_TAB[7]} by ${REC_TAB[8]} from ${_BF%.lmp}" >> "maps/${MAP_DIR}/record.txt"
                fi
                ((_C++))
            fi
        done
        if [ "${_C}" -lt 0 ]; then
            rm -rf "maps/${MAP_DIR}"
        fi
    fi

    echo "RECORD_REMOVED - done"
    exit 0
;;
"UPDATE")
    _update
;;
*)
        echo "ERROR - Invalid $0 command…"
        exit 999
;;
esac

exit 0