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

try {
    $pdo = pdo();
    ensure_hotel_exists($pdo, $hotelId, $hotelId);

    if ($action === 'list') {
        $stmt = $pdo->prepare('
            SELECT id, hotel_id, user_id, full_name, role, status, created_at, updated_at
            FROM hotel_users
            WHERE hotel_id = ?
            ORDER BY role, full_name
        ');
        $stmt->execute([$hotelId]);
        json_response(['ok' => true, 'users' => $stmt->fetchAll()]);
    }

    if ($action === 'save') {
        $userId = strtolower(trim((string)($data['user_id'] ?? '')));
        $fullName = trim((string)($data['full_name'] ?? ''));
        $role = trim((string)($data['role'] ?? 'Waiter'));
        $password = (string)($data['password'] ?? '');
        $status = (int)($data['status'] ?? 1) === 1 ? 1 : 0;

        if ($userId === '' || $fullName === '' || !in_array($role, ['Waiter', 'Kitchen', 'Manager'], true)) {
            json_response(['ok' => false, 'error' => 'Missing or invalid user details'], 422);
        }

        if ($password !== '') {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare('
                INSERT INTO hotel_users(hotel_id, user_id, full_name, role, password_hash, status)
                VALUES(?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role=VALUES(role), password_hash=VALUES(password_hash), status=VALUES(status)
            ');
            $stmt->execute([$hotelId, $userId, $fullName, $role, $hash, $status]);
        } else {
            $stmt = $pdo->prepare('
                UPDATE hotel_users
                SET full_name=?, role=?, status=?
                WHERE hotel_id=? AND user_id=?
            ');
            $stmt->execute([$fullName, $role, $status, $hotelId, $userId]);
        }

        json_response(['ok' => true]);
    }

    json_response(['ok' => false, 'error' => 'Unknown action'], 422);
} catch (Throwable $error) {
    json_response(['ok' => false, 'error' => $error->getMessage()], 500);
}
