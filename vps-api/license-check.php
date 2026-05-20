<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['ok' => false, 'error' => 'POST required'], 405);
}

require_api_key();
[$data] = read_json_body();

$hotelId = normalize_hotel_id($data['hotel_id'] ?? '');
$licenseCode = trim((string)($data['license_code'] ?? ''));

if ($licenseCode === '') {
    json_response(['ok' => false, 'error' => 'Missing license_code'], 422);
}

try {
    $stmt = pdo()->prepare('
        SELECT slno, customer_id, hotel_id, license_code, validity_till, status, licence_approval, purchase_date
        FROM licenses
        WHERE license_code = ?
        LIMIT 1
    ');
    $stmt->execute([$licenseCode]);
    $license = $stmt->fetch();

    if (!$license) {
        json_response(['ok' => false, 'valid' => false, 'error' => 'License not found'], 404);
    }

    $assignedHotelId = strtoupper(trim((string)($license['hotel_id'] ?? '')));
    $approvalOpen = (int)$license['licence_approval'] === 1;

    if ($assignedHotelId !== '' && $assignedHotelId !== $hotelId && !$approvalOpen) {
        json_response(['ok' => false, 'valid' => false, 'error' => 'License already activated for another Hotel ID'], 409);
    }

    if ($assignedHotelId === '' && !$approvalOpen) {
        json_response(['ok' => false, 'valid' => false, 'error' => 'License activation approval is closed'], 409);
    }

    if ($approvalOpen) {
        pdo()->prepare('
            INSERT INTO hotels(hotel_id, hotel_name, status)
            VALUES(?, ?, 1)
            ON DUPLICATE KEY UPDATE status = VALUES(status)
        ')->execute([$hotelId, $hotelId]);

        pdo()->prepare('
            UPDATE licenses
            SET hotel_id = ?, licence_approval = 0, updated_at = CURRENT_TIMESTAMP
            WHERE license_code = ?
        ')->execute([$hotelId, $licenseCode]);

        $license['hotel_id'] = $hotelId;
        $license['licence_approval'] = 0;
    }

    $active = (int)$license['status'] === 1;
    $notExpired = strtotime($license['validity_till'] . ' 23:59:59') >= time();

    json_response([
        'ok' => true,
        'valid' => $active && $notExpired,
        'license' => $license,
        'reason' => !$active ? 'inactive' : (!$notExpired ? 'expired' : 'valid'),
    ]);
} catch (Throwable $error) {
    json_response(['ok' => false, 'error' => $error->getMessage()], 500);
}
