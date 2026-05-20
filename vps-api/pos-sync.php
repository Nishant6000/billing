<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['ok' => false, 'error' => 'POST required'], 405);
}

require_api_key();
[$data, $rawBody] = read_json_body();

$backup = $data['backup'] ?? null;
if (!is_array($backup)) {
    json_response(['ok' => false, 'error' => 'Missing backup payload'], 422);
}

$hotelId = normalize_hotel_id($data['hotel_id'] ?? ($backup['hotel_id'] ?? ''));
$deviceId = trim((string)($data['device_id'] ?? 'default'));
if ($deviceId === '') {
    $deviceId = 'default';
}

$shopName = trim((string)($data['shop_name'] ?? ''));
$syncedAt = trim((string)($data['synced_at'] ?? gmdate('c')));
$payloadJson = json_encode($backup, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($payloadJson === false) {
    json_response(['ok' => false, 'error' => 'Unable to encode backup'], 422);
}

$payloadSize = strlen($payloadJson);

try {
    $pdo = pdo();
    ensure_hotel_exists($pdo, $hotelId, $shopName);
    $pdo->beginTransaction();

    $snapshot = $pdo->prepare('
        INSERT INTO pos_sync_snapshots
            (hotel_id, device_id, shop_name, sync_type, payload_json, payload_size, synced_at)
        VALUES
            (?, ?, ?, ?, ?, ?, ?)
    ');
    $snapshot->execute([
        $hotelId,
        $deviceId,
        $shopName,
        'full_backup',
        $payloadJson,
        $payloadSize,
        date('Y-m-d H:i:s', strtotime($syncedAt) ?: time()),
    ]);

    $latest = $pdo->prepare('
        INSERT INTO pos_latest_snapshots
            (hotel_id, device_id, shop_name, payload_json, payload_size, last_synced_at)
        VALUES
            (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            shop_name = VALUES(shop_name),
            payload_json = VALUES(payload_json),
            payload_size = VALUES(payload_size),
            last_synced_at = VALUES(last_synced_at),
            updated_at = CURRENT_TIMESTAMP
    ');
    $latest->execute([
        $hotelId,
        $deviceId,
        $shopName,
        $payloadJson,
        $payloadSize,
        date('Y-m-d H:i:s', strtotime($syncedAt) ?: time()),
    ]);

    $log = $pdo->prepare('
        INSERT INTO pos_sync_logs
            (hotel_id, device_id, sync_direction, sync_status, message)
        VALUES
            (?, ?, "upload", "success", ?)
    ');
    $log->execute([$hotelId, $deviceId, 'Backup uploaded successfully']);

    $pdo->commit();

    json_response([
        'ok' => true,
        'hotel_id' => $hotelId,
        'device_id' => $deviceId,
        'payload_size' => $payloadSize,
        'server_received_at' => gmdate('c'),
    ]);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    try {
        if (isset($pdo)) {
            $failLog = $pdo->prepare('
                INSERT INTO pos_sync_logs
                    (hotel_id, device_id, sync_direction, sync_status, message)
                VALUES
                    (?, ?, "upload", "failed", ?)
            ');
            $failLog->execute([$hotelId ?? 'UNKNOWN', $deviceId ?? 'default', $error->getMessage()]);
        }
    } catch (Throwable $ignored) {
    }
    json_response(['ok' => false, 'error' => $error->getMessage()], 500);
}

