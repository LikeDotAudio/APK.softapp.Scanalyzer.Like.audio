<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// The connection comes from the environment where there is one: the scan-api
// stack (../../../Docker/docker-compose.yml) sets SCAN_DB_* and reaches the
// database at sql-proxy:3306. Unset, it is the co-located cPanel host, where
// the database is on localhost and the deploy fills in the password.
$host = getenv('SCAN_DB_HOST') ?: 'localhost';
$port = (int) (getenv('SCAN_DB_PORT') ?: 3306);
$db   = getenv('SCAN_DB_NAME') ?: 'tandapho_scanalyzer';
$user = getenv('SCAN_DB_USER') ?: 'tandapho_scanalyzer';
$pass = getenv('SCAN_DB_PASS') !== false ? getenv('SCAN_DB_PASS') : 'GITHUB_SECRET_DB_PASSWORD';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;port=$port;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
    // test connection and get record count
    $stmt = $pdo->query("SELECT COUNT(*) FROM audio_files");
    $records = (int)$stmt->fetchColumn();
    echo json_encode(['status' => 'online', 'records' => $records]);
} catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'offline', 'error' => $e->getMessage()]);
}
?>
