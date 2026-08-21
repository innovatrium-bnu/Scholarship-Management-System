<?php

use Illuminate\Support\Str;
use Pdo\Mysql;

return [

    /*
    |--------------------------------------------------------------------------
    | Default Database Connection Name
    |--------------------------------------------------------------------------
    |
    | Here you may specify which of the database connections below you wish
    | to use as your default connection for database operations. This is
    | the connection which will be utilized unless another connection
    | is explicitly specified when you execute a query / statement.
    |
    */

    'default' => env('DB_CONNECTION', 'oracle'),

    /*
    |--------------------------------------------------------------------------
    | Database Connections
    |--------------------------------------------------------------------------
    |
    | Below are all of the database connections defined for your application.
    | An example configuration is provided for each database system which
    | is supported by Laravel. You're free to add / remove connections.
    |
    */

    'connections' => [

        /*
         * The one connection this application actually uses. BNU IT runs
         * Oracle 19c and the schema targets it specifically, so the stock
         * connections below are Laravel boilerplate and are kept only because
         * removing them buys nothing — the image ships oci8 and nothing else,
         * so none of them can open a connection anyway.
         *
         * Driver comes from yajra/laravel-oci8. Keys mirror that package's
         * src/config/oracle.php, which is no longer published to the app by
         * default; the two values that deviate from its defaults are called
         * out below and both matter.
         */
        'oracle' => [
            'driver' => 'oracle',
            // A full TNS descriptor, if one is ever handed to us instead of a
            // host and service. Set, it wins outright and every key below
            // except the credentials is ignored.
            'tns' => env('DB_TNS', ''),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '1521'),
            // Oracle connects to a service, not to a database file. The
            // service name is what reaches the TNS descriptor; `database` is
            // set to the same value so getDatabaseName() and Laravel's
            // connection error messages report something meaningful rather
            // than an empty string.
            'database' => env('DB_DATABASE', 'ORCLPDB1'),
            'service_name' => env('DB_SERVICE_NAME', env('DB_DATABASE', 'ORCLPDB1')),
            'username' => env('DB_USERNAME', ''),
            'password' => env('DB_PASSWORD', ''),
            // Not a preference: student names include Urdu and Punjabi
            // transliterations, and a non-Unicode client character set
            // replaces them with question marks without erroring.
            'charset' => env('DB_CHARSET', 'AL32UTF8'),
            'prefix' => '',
            // ALTER SESSION SET CURRENT_SCHEMA — connect as one user, own the
            // objects as another. Empty here; this is the knob Phase 4 uses to
            // point the test suite at a second schema.
            'prefix_schema' => env('DB_SCHEMA_PREFIX', ''),
            'edition' => env('DB_EDITION', 'ora$base'),
            // Load-bearing, and not only for the TNS descriptor options below
            // (EXPIRE_TIME is gated at 19c). The schema grammar reads it too:
            // at 21c and above `json`/`jsonb` columns compile to Oracle's
            // native JSON type, and below that to CLOB. 19c has no native
            // JSON, so this value is what keeps the migrations emitting
            // something 19c will accept. Raising it without a server to match
            // produces DDL that fails on BNU's instance.
            'server_version' => env('DB_SERVER_VERSION', '19c'),
            'load_balance' => env('DB_LOAD_BALANCE', 'yes'),
            'connect_timeout' => env('DB_CONNECT_TIMEOUT', ''),
            /*
             * No retries by default, unlike the package, which ships 3.
             *
             * Oracle retries the whole descriptor on any failure, including
             * permanent ones. Measured against a host that does not resolve at
             * all, the package's defaults turn an immediate and perfectly clear
             * ORA-12545 into 52 seconds of silence — paid by every artisan
             * command and every test run whenever the database is simply not
             * up, which in development is most of the time.
             *
             * Retrying is a production concern: it earns its keep against an
             * instance that fails over or is briefly overloaded, which BNU's
             * may be and ours is not. So it stays an env var rather than
             * disappearing — set DB_RETRY_COUNT there once we know what their
             * instance looks like. Zero here means the descriptor omits
             * RETRY_COUNT entirely, which is Oracle's own default.
             */
            'retry_count' => env('DB_RETRY_COUNT', '0'),
            'retry_delay' => env('DB_RETRY_DELAY', '0'),
            // Per connection attempt. Oracle's own default is 60, which is a
            // long time to wait to be told a server is down.
            'transport_connect_timeout' => env('DB_TRANSPORT_CONNECT_TIMEOUT', '15'),
            'expire_time' => env('DB_EXPIRE_TIME', '0'),
            // 128, not the package's default of 30. The package truncates the
            // identifiers it generates — sequences and triggers for
            // autoincrement columns, index names — to this length with
            // mb_substr, so leaving it at 30 does not error, it produces
            // colliding names. Laravel's own generated index names on this
            // schema routinely run past 30 characters. 19c allows 128 as long
            // as COMPATIBLE is 12.2 or above, which it is on a fresh 19.3.
            'max_name_len' => env('ORA_MAX_NAME_LEN', 128),
            'dynamic' => [],
            // Applied on every connection. The date formats are load-bearing:
            // Oracle's NLS defaults are DD-MON-RR, which does not round-trip
            // the ISO-8601 strings Eloquent binds for date and timestamp
            // columns.
            'sessionVars' => [
                'NLS_TIME_FORMAT' => 'HH24:MI:SS',
                'NLS_DATE_FORMAT' => 'YYYY-MM-DD HH24:MI:SS',
                'NLS_TIMESTAMP_FORMAT' => 'YYYY-MM-DD HH24:MI:SS',
                'NLS_TIMESTAMP_TZ_FORMAT' => 'YYYY-MM-DD HH24:MI:SS TZH:TZM',
                'NLS_NUMERIC_CHARACTERS' => '.,',
                /*
                 * The offset Laravel never sends.
                 *
                 * Eloquent binds every timestamp as 'Y-m-d H:i:s' — a wall
                 * clock with no zone — and Laravel's own clock is UTC, because
                 * app.timezone is UTC. Oracle, handed a string with no offset
                 * for a TIMESTAMP WITH TIME ZONE column, completes it from the
                 * session time zone, which oci8 takes from the client's
                 * environment. So the same instant stored from a machine in
                 * Asia/Karachi lands 5 hours from where it was stored from a
                 * UTC container, and nothing errors: the row is simply wrong.
                 *
                 * Pinning the session to UTC makes Oracle's assumption match
                 * the one Laravel already made. 6 timestampTz columns depend on
                 * it. The alternative — binding offsets explicitly — would mean
                 * overriding the grammar's every timestamp path, to arrive at
                 * the same instants.
                 *
                 * Not an env var on purpose. This is not a deployment
                 * preference; it is the zone Laravel's own timestamps are
                 * already in, and a server that set it to anything else would
                 * silently reintroduce the bug.
                 */
                'TIME_ZONE' => '+00:00',
            ],
        ],

        'sqlite' => [
            'driver' => 'sqlite',
            'url' => env('DB_URL'),
            'database' => env('DB_DATABASE', database_path('database.sqlite')),
            'prefix' => '',
            'foreign_key_constraints' => env('DB_FOREIGN_KEYS', true),
            'busy_timeout' => null,
            'journal_mode' => null,
            'synchronous' => null,
            'transaction_mode' => 'DEFERRED',
        ],

        'mysql' => [
            'driver' => 'mysql',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                Mysql::ATTR_SSL_CA => env('MYSQL_ATTR_SSL_CA'),
            ]) : [],
        ],

        'mariadb' => [
            'driver' => 'mariadb',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                Mysql::ATTR_SSL_CA => env('MYSQL_ATTR_SSL_CA'),
            ]) : [],
        ],

        'pgsql' => [
            'driver' => 'pgsql',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '5432'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'sslmode' => env('DB_SSLMODE', 'prefer'),
        ],

        'sqlsrv' => [
            'driver' => 'sqlsrv',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', 'localhost'),
            'port' => env('DB_PORT', '1433'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            // 'encrypt' => env('DB_ENCRYPT', 'yes'),
            // 'trust_server_certificate' => env('DB_TRUST_SERVER_CERTIFICATE', 'false'),
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Migration Repository Table
    |--------------------------------------------------------------------------
    |
    | This table keeps track of all the migrations that have already run for
    | your application. Using this information, we can determine which of
    | the migrations on disk haven't actually been run on the database.
    |
    */

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Redis Databases
    |--------------------------------------------------------------------------
    |
    | Redis is an open source, fast, and advanced key-value store that also
    | provides a richer body of commands than a typical key-value system
    | such as Memcached. You may define your connection settings here.
    |
    */

    'redis' => [

        'client' => env('REDIS_CLIENT', 'phpredis'),

        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', Str::slug((string) env('APP_NAME', 'laravel')).'-database-'),
            'persistent' => env('REDIS_PERSISTENT', false),
        ],

        'default' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_DB', '0'),
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
        ],

        'cache' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_CACHE_DB', '1'),
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
        ],

    ],

];
