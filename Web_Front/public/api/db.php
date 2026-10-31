<?php
/** The corpus API's one adapter: the database connection, CORS and the upload token.
 *
 *  Every endpoint used to repeat the same DSN/credential block and send
 *  `Access-Control-Allow-Origin: *`; this file holds each rule once (audit 2026-10-30).
 *
 *  CONNECTION. From the environment where there is one: the scan-api stack
 *  (../../../Docker/docker-compose.yml) sets SCAN_DB_* and reaches the database at
 *  sql-proxy:3306. Unset, it is the co-located cPanel host, where the database is on
 *  localhost and the deploy fills in the password placeholder below.
 *
 *  CORS. The web front end calls these endpoints from its own origin and needs no
 *  header. Only the desktop (Tauri) app is cross-origin, so only its origins — plus
 *  any listed in SCAN_ALLOWED_ORIGINS (comma separated) — get one, reflected, never `*`.
 *
 *  UPLOAD TOKEN. When SCAN_UPLOAD_TOKEN is set on the server, a write must carry it in
 *  `X-Upload-Token`; unset, writes stay open as before (the public corpus is
 *  crowd-filled). Whether to set it is the operator's call.
 */

// AN INCLUDE, NOT AN ENDPOINT. It ships in public/ because its three callers
// `require __DIR__ . '/db.php'` on every host they deploy to, so a direct request
// must find nothing: no connection attempt, no CORS, no header. The public-api
// gate (scripts/check-public-api.mjs) only exempts a required file that carries
// this guard.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === realpath(__FILE__)) {
    http_response_code(404);
    exit;
}


const SCAN_DEFAULT_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];

function scan_headers(string $methods = 'GET'): void {
    header('Content-Type: application/json');
    $allowed = SCAN_DEFAULT_ORIGINS;
    $extra = getenv('SCAN_ALLOWED_ORIGINS');
    if ($extra !== false && trim($extra) !== '') {
        $allowed = array_merge($allowed, array_map('trim', explode(',', $extra)));
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && in_array($origin, $allowed, true)) {
        header("Access-Control-Allow-Origin: $origin");
        header('Vary: Origin');
        header("Access-Control-Allow-Methods: $methods, OPTIONS");
        header('Access-Control-Allow-Headers: Content-Type, X-Upload-Token');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/** Refuse a write without the configured token. No token configured: no check. */
function scan_require_upload_token(): void {
    $want = getenv('SCAN_UPLOAD_TOKEN');
    if ($want === false || $want === '') {
        return;
    }
    $got = $_SERVER['HTTP_X_UPLOAD_TOKEN'] ?? '';
    if (!is_string($got) || !hash_equals($want, $got)) {
        http_response_code(401);
        exit(json_encode(['error' => 'upload token missing or wrong (X-Upload-Token)']));
    }
}

function scan_db(): PDO {
    $host = getenv('SCAN_DB_HOST') ?: 'localhost';
    $port = (int) (getenv('SCAN_DB_PORT') ?: 3306);
    $db   = getenv('SCAN_DB_NAME') ?: 'tandapho_scanalyzer';
    $user = getenv('SCAN_DB_USER') ?: 'tandapho_scanalyzer';
    $pass = getenv('SCAN_DB_PASS') !== false ? getenv('SCAN_DB_PASS') : 'GITHUB_SECRET_DB_PASSWORD';
    return new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}
