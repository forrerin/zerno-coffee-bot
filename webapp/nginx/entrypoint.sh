#!/bin/sh
# Выбирает конфиг: HTTPS, если сертификат Let's Encrypt уже получен, иначе HTTP
# (HTTP подходит для локального запуска и туннелей ngrok / cloudflared).
set -e

DOMAIN="${DOMAIN:-localhost}"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

if [ -f "$CERT" ]; then
  TEMPLATE=/etc/nginx/zerno/https.conf.template
  echo "zerno: HTTPS для ${DOMAIN}"
else
  TEMPLATE=/etc/nginx/zerno/http.conf.template
  echo "zerno: сертификат не найден, работаю по HTTP"
fi

envsubst '${DOMAIN}' < "$TEMPLATE" > /etc/nginx/conf.d/zerno.conf

# перечитываем конфиг раз в 12 часов, чтобы подхватить продлённый сертификат
(while true; do sleep 43200; nginx -s reload; done) &

exec nginx -g 'daemon off;'
