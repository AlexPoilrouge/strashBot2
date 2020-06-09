#!/bin/bash

PASS="$( head -1 /dev/urandom | tr -dc 'a-z0-9' | fold -w 6 | head -n 1 )"

FILE="$( pwd )/.TMP_PASS"

echo "${PASS}" > "$FILE"

srb2kart -dedicated -password ${PASS} -room 33
