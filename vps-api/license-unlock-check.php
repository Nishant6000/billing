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
        json_response(['ok' => false, 'unlock_allowed' => false, 'error' => 'License not found'], 404);
    }

    $assignedHotelId = strtoupper(trim((string)($license['hotel_id'] ?? '')));
    $approvalOpen = (int)$license['licence_approval'] === 1;
    $matchesCurrentHotel = $assignedHotelId === $hotelId;

    json_response([
        'ok' => true,
        'unlock_allowed' => $approvalOpen && $matchesCurrentHotel,
        'licence_approval' => (int)$license['licence_approval'],
        'hotel_id' => $assignedHotelId,
        'license' => $license,
        'reason' => !$matchesCurrentHotel ? 'hotel_id_mismatch' : (!$approvalOpen ? 'approval_closed' : 'approval_open'),
    ]);
} catch (Throwable $error) {
    json_response(['ok' => false, 'error' => $error->getMessage()], 500);
}
