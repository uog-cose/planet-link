#!/bin/sh
set -eu

mkdir -p /app/data /app/media /app/staticfiles
chown -R youthquest:youthquest /app/data /app/media /app/staticfiles

exec su -s /bin/sh youthquest -c "python manage.py migrate --noinput && python manage.py collectstatic --noinput && if [ \"${SEED_DEMO:-false}\" = \"true\" ]; then python manage.py seed_demo; fi && exec $*"
