# Scanalyzer's corpus API — php-fpm over its three endpoints, and nothing else.
#   docker compose -f 'PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Docker/docker-compose.yml' up -d --build
# WHY IT IS HERE AND NOT IN THE DATABASE STACK (PLAN-3424.01). The storage tier
# (POD.database/DATABASE.server.SQL) used to COPY these files out of this
# repository, so the database image could not build without a Scanalyzer
# checkout and broke whenever this folder moved. Only Scanalyzer calls them, so
# they are built from here, and the database is reached the way every other
# client reaches it: sql-proxy:3306.
# ⚠️ THE BUILD CONTEXT IS Web_Front/public/api/ (compose: `context:
#    ../Web_Front/public/api`), the three PHP endpoints only, so no ignore list is needed
#    and nothing else in this repository can reach the image.
FROM php:8.3-fpm-alpine

LABEL description="Scanalyzer — corpus API (PHP-FPM) for the APK.audio storage tier"

# pdo_mysql, not mysqli: every endpoint connects with `new PDO`.
RUN docker-php-ext-install pdo_mysql

# TCP, not the default unix socket: the FastCGI clients (the gateway's Caddy
# and Storage-Portal's nginx) are other containers.
RUN sed -i 's#^listen = .*#listen = 9000#' /usr/local/etc/php-fpm.d/www.conf

# A corpus upload is one POST carrying a chunk of peak records; the stock
# 8M/1000-variable limits truncate it into a 500 with no message.
# clear_env = no: php-fpm drops the container environment by default, and the
# endpoints read their connection from SCAN_DB_*.
RUN { \
        echo 'post_max_size = 64M'; \
        echo 'upload_max_filesize = 64M'; \
        echo 'max_input_vars = 10000'; \
        echo 'display_errors = Off'; \
        echo 'log_errors = On'; \
        echo 'error_log = /proc/self/fd/2'; \
    } > /usr/local/etc/php/conf.d/zz-scan-api.ini \
 && echo 'clear_env = no' >> /usr/local/etc/php-fpm.d/www.conf

# THE THREE ENDPOINTS, BY NAME, AND ONLY THOSE — plus their one adapter (db.php:
# connection, CORS, upload token) and the upload allow-list upload_peak.php
# serves (upload_columns.json). The hand-run migrations and
# debug scripts (init_db, fix_db, migrate_* …) live in Web_Front/tools/api/,
# outside this context, one of them drops tables; naming the three keeps it so if
# a fourth file ever lands in public/api/ without a caller.
COPY ["db.php", "db_status.php", "get_peaks.php", "upload_peak.php", "upload_columns.json", "/srv/scan-api/"]

# Fail the BUILD, not the first request, on a syntax error.
RUN set -eu; for f in /srv/scan-api/*.php; do php -l "$f"; done

EXPOSE 9000
