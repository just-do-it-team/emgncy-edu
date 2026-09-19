#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA" /var/lib/postgresql
  exec gosu postgres "$0" "$@"
fi

mkdir -p "$PGDATA"
chmod 700 "$PGDATA"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  find "$PGDATA" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +

  until pg_isready -h postgres-primary -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
    sleep 1
  done

  printf '%s\n' "postgres-primary:5432:*:${POSTGRES_REPLICATION_USER}:${POSTGRES_REPLICATION_PASSWORD}" \
    > /var/lib/postgresql/.pgpass
  chmod 600 /var/lib/postgresql/.pgpass

  PGPASSWORD="$POSTGRES_PASSWORD" psql \
    -h postgres-primary -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    -c "SELECT pg_create_physical_replication_slot('s112_replica') WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 's112_replica');"

  PGPASSWORD="$POSTGRES_REPLICATION_PASSWORD" pg_basebackup \
    -h postgres-primary \
    -p 5432 \
    -U "$POSTGRES_REPLICATION_USER" \
    -D "$PGDATA" \
    -Fp -Xs -P -R \
    -S s112_replica
fi

exec postgres -c hot_standby=on

