#!/usr/bin/env bash
# PostgreSQL backup with daily / weekly / monthly retention, uploaded OFF-SERVER
# to S3-compatible storage. Run daily from cron, e.g.:
#   15 3 * * *  cd /srv/shop && ./scripts/backup.sh >> /var/log/shop-backup.log 2>&1
# Requires: pg_dump, aws CLI (works with R2/Spaces/MinIO via --endpoint-url).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required (never keep backups only on this server)}"
ENDPOINT_ARGS=()
[[ -n "${BACKUP_S3_ENDPOINT:-}" ]] && ENDPOINT_ARGS=(--endpoint-url "$BACKUP_S3_ENDPOINT")

STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
DIR=$(mktemp -d)
FILE="$DIR/db-$STAMP.dump"
trap 'rm -rf "$DIR"' EXIT

# Strip Prisma's ?schema= param which pg_dump does not understand.
PGURL="${DATABASE_URL%%\?*}"
pg_dump --format=custom --no-owner --no-privileges --dbname="$PGURL" --file="$FILE"
sha256sum "$FILE" > "$FILE.sha256"

upload() { aws s3 cp "${ENDPOINT_ARGS[@]}" "$1" "s3://$BACKUP_S3_BUCKET/$2" --only-show-errors; }
upload "$FILE" "daily/db-$STAMP.dump"
upload "$FILE.sha256" "daily/db-$STAMP.dump.sha256"
[[ "$(date -u +%u)" == "7" ]] && upload "$FILE" "weekly/db-$STAMP.dump"
[[ "$(date -u +%d)" == "01" ]] && upload "$FILE" "monthly/db-$STAMP.dump"

# Retention: 14 daily, 8 weekly, 12 monthly. (Prefer bucket lifecycle rules where available.)
prune() {
  local prefix=$1 keep=$2
  aws s3 ls "${ENDPOINT_ARGS[@]}" "s3://$BACKUP_S3_BUCKET/$prefix/" | awk '{print $4}' | grep '\.dump$' | sort | head -n -"$keep" | while read -r f; do
    aws s3 rm "${ENDPOINT_ARGS[@]}" "s3://$BACKUP_S3_BUCKET/$prefix/$f" --only-show-errors
    aws s3 rm "${ENDPOINT_ARGS[@]}" "s3://$BACKUP_S3_BUCKET/$prefix/$f.sha256" --only-show-errors || true
  done
}
prune daily 14; prune weekly 8; prune monthly 12
echo "Backup OK: $STAMP"

# RESTORE (test this quarterly on a scratch database):
#   aws s3 cp s3://$BACKUP_S3_BUCKET/daily/db-<stamp>.dump .
#   pg_restore --clean --if-exists --no-owner --dbname="$SCRATCH_DATABASE_URL" db-<stamp>.dump
