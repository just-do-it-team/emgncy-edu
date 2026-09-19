#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=repl_user="$POSTGRES_REPLICATION_USER" \
  --set=repl_password="$POSTGRES_REPLICATION_PASSWORD" <<'EOSQL'
CREATE ROLE :"repl_user" WITH REPLICATION LOGIN PASSWORD :'repl_password';
EOSQL

printf '\nhost replication %s 0.0.0.0/0 scram-sha-256\n' \
  "$POSTGRES_REPLICATION_USER" >> "$PGDATA/pg_hba.conf"

