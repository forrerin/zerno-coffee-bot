#!/bin/sh
# Первичное получение сертификата Let's Encrypt.
# Запуск на VPS из корня проекта: sh scripts/init-letsencrypt.sh you@example.com
set -e

EMAIL="$1"
DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2)

if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "localhost" ]; then
  echo "Укажите DOMAIN в .env (домен должен указывать на IP этого сервера)"
  exit 1
fi
if [ -z "$EMAIL" ]; then
  echo "Использование: sh scripts/init-letsencrypt.sh you@example.com"
  exit 1
fi

mkdir -p certbot/conf certbot/www

echo "1/3 Запускаю nginx по HTTP для проверки домена…"
docker compose up -d --build nginx

echo "2/3 Получаю сертификат для $DOMAIN…"
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email

echo "3/3 Перезапускаю nginx с HTTPS…"
docker compose restart nginx
docker compose up -d

echo "Готово: https://$DOMAIN"
