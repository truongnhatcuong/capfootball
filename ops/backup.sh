#!/bin/sh
set -eu
: "${BACKUP_DIR:?Set BACKUP_DIR to a protected absolute directory}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump -u"$MYSQL_USER" --single-transaction --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' > "$BACKUP_DIR/capfootball-$stamp.sql"
test -s "$BACKUP_DIR/capfootball-$stamp.sql"
echo "Backup created. Encrypt and upload to your configured off-site storage."
