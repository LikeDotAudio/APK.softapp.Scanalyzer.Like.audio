<?php
require __DIR__ . '/db.php';
scan_headers('GET');


try {
    $pdo = scan_db();
    // test connection and get record count
    $stmt = $pdo->query("SELECT COUNT(*) FROM audio_files");
    $records = (int)$stmt->fetchColumn();
    echo json_encode(['status' => 'online', 'records' => $records]);
} catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'offline', 'error' => $e->getMessage()]);
}
?>
