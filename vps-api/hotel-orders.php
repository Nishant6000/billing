<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['ok' => false, 'error' => 'POST required'], 405);
}

require_api_key();
[$data] = read_json_body();

$action = trim((string)($data['action'] ?? ''));
$hotelId = normalize_hotel_id($data['hotel_id'] ?? '');

function valid_order_status(string $status): string
{
    $status = strtolower(trim($status));
    return in_array($status, ['pending', 'preparing', 'ready', 'served', 'cancelled'], true) ? $status : 'pending';
}

try {
    $pdo = pdo();
    ensure_hotel_exists($pdo, $hotelId, $hotelId);

    if ($action === 'upsert_kot') {
        $kot = $data['kot'] ?? null;
        if (!is_array($kot) || empty($kot['kot_no'])) {
            json_response(['ok' => false, 'error' => 'Missing kot payload'], 422);
        }
        $kotNo = trim((string)$kot['kot_no']);
        $status = valid_order_status((string)($kot['status'] ?? 'pending'));
        $tableName = trim((string)($kot['table_name'] ?? ''));
        $station = (($kot['station'] ?? 'kitchen') === 'store') ? 'store' : 'kitchen';
        $waiterName = trim((string)($kot['order_user_name'] ?? ''));
        $payload = json_encode($kot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $stmt = $pdo->prepare('
            INSERT INTO hotel_kot_orders(hotel_id, kot_no, table_name, waiter_name, status, payload_json)
            VALUES(?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              table_name = VALUES(table_name),
              waiter_name = VALUES(waiter_name),
              status = VALUES(status),
              payload_json = VALUES(payload_json),
              updated_at = CURRENT_TIMESTAMP
        ');
        $kot['station'] = $station;
        $payload = json_encode($kot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $stmt->execute([$hotelId, $kotNo, $tableName, $waiterName, $status, $payload]);
        json_response(['ok' => true, 'kot_no' => $kotNo]);
    }

    if ($action === 'list_kots') {
        $stmt = $pdo->prepare("
            SELECT kot_no, table_name, waiter_name, status, payload_json, created_at, updated_at
            FROM hotel_kot_orders
            WHERE hotel_id = ? AND status IN ('pending','preparing','ready')
            ORDER BY updated_at DESC
            LIMIT 200
        ");
        $stmt->execute([$hotelId]);
        $rows = array_map(static function (array $row): array {
            $payload = json_decode((string)$row['payload_json'], true);
            return is_array($payload) ? array_merge($payload, [
                'cloud_status' => $row['status'],
                'cloud_updated_at' => $row['updated_at'],
            ]) : $row;
        }, $stmt->fetchAll());
        json_response(['ok' => true, 'kots' => $rows]);
    }

    if ($action === 'update_kot_status') {
        $kotNo = trim((string)($data['kot_no'] ?? ''));
        $status = valid_order_status((string)($data['status'] ?? 'pending'));
        if ($kotNo === '') json_response(['ok' => false, 'error' => 'Missing kot_no'], 422);
        $stmt = $pdo->prepare('
            UPDATE hotel_kot_orders
            SET status = ?,
                payload_json = JSON_SET(payload_json, "$.status", ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE hotel_id = ? AND kot_no = ?
        ');
        $stmt->execute([$status, $status, $hotelId, $kotNo]);
        json_response(['ok' => true, 'kot_no' => $kotNo, 'status' => $status]);
    }

    if ($action === 'update_item_status') {
        $kotNo = trim((string)($data['kot_no'] ?? ''));
        $productName = trim((string)($data['product_name'] ?? ''));
        $status = valid_order_status((string)($data['status'] ?? 'pending'));
        if ($kotNo === '' || $productName === '') json_response(['ok' => false, 'error' => 'Missing kot_no or product_name'], 422);
        $stmt = $pdo->prepare('SELECT payload_json FROM hotel_kot_orders WHERE hotel_id = ? AND kot_no = ? LIMIT 1');
        $stmt->execute([$hotelId, $kotNo]);
        $row = $stmt->fetch();
        if (!$row) json_response(['ok' => false, 'error' => 'KOT not found'], 404);
        $payload = json_decode((string)$row['payload_json'], true);
        if (!is_array($payload)) $payload = [];
        foreach (($payload['items'] ?? []) as &$item) {
            if (($item['product_name'] ?? '') === $productName) {
                $item['status'] = $status;
            }
        }
        unset($item);
        $overall = 'pending';
        $items = $payload['items'] ?? [];
        if ($items && count(array_filter($items, static fn($item) => ($item['status'] ?? '') === 'ready')) === count($items)) $overall = 'ready';
        elseif ($items && count(array_filter($items, static fn($item) => ($item['status'] ?? '') === 'preparing' || ($item['status'] ?? '') === 'ready')) > 0) $overall = 'preparing';
        $payload['status'] = $overall;
        $update = $pdo->prepare('UPDATE hotel_kot_orders SET status=?, payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE hotel_id=? AND kot_no=?');
        $update->execute([$overall, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $hotelId, $kotNo]);
        json_response(['ok' => true, 'kot_no' => $kotNo, 'status' => $overall]);
    }

    json_response(['ok' => false, 'error' => 'Unknown action'], 422);
} catch (Throwable $error) {
    json_response(['ok' => false, 'error' => $error->getMessage()], 500);
}
