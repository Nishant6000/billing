<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['ok' => false, 'error' => 'POST required'], 405);
}

[$data] = read_json_body();

$hotelId = normalize_hotel_id($data['hotel_id'] ?? '');
$userId = strtolower(trim((string)($data['user_id'] ?? '')));
$password = (string)($data['password'] ?? $data['pin'] ?? '');

if ($userId === '' || $password === '') {
    json_response(['ok' => false, 'error' => 'Missing user_id or password'], 422);
}

try {
    $pdo = pdo();
    $stmt = $pdo->prepare('
        SELECT hu.id, hu.hotel_id, hu.user_id, hu.full_name, hu.role, hu.password_hash, hu.status,
               l.license_code, l.validity_till, l.status AS license_status
        FROM hotel_users hu
        LEFT JOIN licenses l ON l.hotel_id = hu.hotel_id
        WHERE hu.hotel_id = ? AND hu.user_id = ?
        ORDER BY l.validity_till DESC
        LIMIT 1
    ');
    $stmt->execute([$hotelId, $userId]);
    $user = $stmt->fetch();

    if (!$user || (int)$user['status'] !== 1 || !password_verify($password, (string)$user['password_hash'])) {
        json_response(['ok' => false, 'error' => 'Invalid or inactive login'], 401);
    }

    $licenseActive = (int)($user['license_status'] ?? 0) === 1;
    $notExpired = !empty($user['validity_till']) && strtotime($user['validity_till'] . ' 23:59:59') >= time();
    if (!$licenseActive || !$notExpired) {
        json_response(['ok' => false, 'error' => 'Hotel license is inactive or expired'], 403);
    }

    json_response([
        'ok' => true,
        'user' => [
            'id' => (int)$user['id'],
            'hotel_id' => $user['hotel_id'],
            'user_id' => $user['user_id'],
            'full_name' => $user['full_name'],
            'role' => $user['role'],
            'status' => 'active',
            'cloud_user' => true,
        ],
        'license' => [
            'status' => 'valid',
            'validity_till' => $user['validity_till'],
            'license_code' => $user['license_code'] ?? '',
        ],
    ]);
} catch (Throwable $error) {
    json_response(['ok' => false, 'error' => $error->getMessage()], 500);
}
