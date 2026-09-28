#!/bin/sh
set -eu

: "${DOMAIN:?DOMAIN must be set}"

if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ] &&
   [ -f "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ]; then
    template=/etc/nginx/https.conf.template
else
    template=/etc/nginx/http.conf.template
fi

envsubst '${DOMAIN}' < "$template" > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
