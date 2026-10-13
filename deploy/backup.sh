#!/bin/sh
# Nightly pg_dump at 02:30 server time, keeping KEEP_DAYS days of dumps.
set -eu
while true; do
  now=$(date +%s)
  next=$(date -d "$(date +%Y-%m-%d) 02:30" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  file="/backups/wortwerk-$(date +%Y%m%d-%H%M).dump"
  if pg_dump --format=custom --file="$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "backup written: $file"
  else
    rm -f "$file.tmp"
    echo "backup failed" >&2
  fi
  find /backups -name 'wortwerk-*.dump' -mtime +"$KEEP_DAYS" -delete
done
