# PHP image for the BNU Scholarship API.
#
# php-fpm rather than the built-in server: nginx serves the SPA from dist/ and
# passes /api/ through to this, which is the same shape the university server
# runs in production. Keeping dev and production on one topology means an nginx
# rule that works here works there.
#
# Debian rather than Alpine: the database is Oracle, oci8 links against Oracle
# Instant Client, and Instant Client is built for glibc. Running it on musl means
# carrying a compatibility shim underneath the database driver, which is not a
# place to put one.
FROM php:8.4-fpm-bookworm

# oci8 is the only extension the application strictly needs; the others are what
# Laravel expects to find. zip is for Composer rather than for the application:
# it extracts dist packages with either the zip extension or an unzip binary, and
# this image has neither otherwise — the installer pulls unzip in as a build
# dependency and removes it again on the way out.
#
# The installer is used rather than a hand-rolled Instant Client build because
# oci8 cannot be compiled by docker-php-ext-install alone: it needs the Instant
# Client runtime and its SDK headers downloaded, unpacked, and registered with
# ldconfig first. The installer does exactly that, and pins Instant Client 21.1
# on x86-64 — a supported client against Oracle 19c, 21c and 23ai alike, so it
# does not constrain which version BNU ultimately runs.
COPY --from=mlocati/php-extension-installer:2 \
     /usr/bin/install-php-extensions /usr/local/bin/

# oci8 comes from its source repository rather than from PECL by name.
#
# There is no alternative source: oci8 and pdo_oci were unbundled from php-src
# in 8.4, so `docker-php-ext-install oci8` cannot work and PECL is the only
# upstream. That made the build fail outright while pecl.php.net was down —
# `pecl install oci8` reports "No releases available", which reads like the
# package is gone rather than like the registry is unreachable.
#
# TODO: revisit once php.net has been stable for a while. Either drop back to
# plain `oci8` to track PECL's latest stable, or keep this and bump the tag
# deliberately. v3.4.1 satisfies yajra/laravel-oci8's ext-oci8 >=3.0.1.
RUN install-php-extensions php/pecl-database-oci8@v3.4.1 intl opcache zip

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# vendor/ lives in a named volume, not the bind mount. Composer's installs use
# atomic renames that fail on a Windows bind mount, and a few thousand files of
# vendor code crossing the filesystem boundary on every request is the single
# biggest cause of slow PHP in Docker on Windows and macOS.
ENV COMPOSER_ALLOW_SUPERUSER=1

WORKDIR /var/www/api

# Laravel writes to all of these. They are created and chowned here so that the
# named volumes mounted over them in docker-compose.yml inherit this ownership
# when Docker seeds them from the image — a bind mount would arrive with the
# host's ownership instead, and php-fpm (running as www-data) could not write.
RUN mkdir -p \
        storage/app/public \
        storage/framework/cache/data \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs \
        bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 9000
CMD ["php-fpm"]
