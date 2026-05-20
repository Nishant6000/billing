<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

function apply_cors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
    if (in_array('*', ALLOWED_ORIGINS, true) || in_array($origin, ALLOWED_ORIGINS, true)) {
        header('Access-Control-Allow-Origin: ' . (in_array('*', ALLOWED_ORIGINS, true) ? '*' : $origin));
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
    header('Access-Control-Max-Age: 86400');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function require_api_key(): void
{
    if (SYNC_API_KEY === '') {
        return;
    }
    $provided = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if (!hash_equals(SYNC_API_KEY, $provided)) {
        json_response(['ok' => false, 'error' => 'Invalid API key'], 401);
    }
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > MAX_SYNC_PAYLOAD_BYTES) {
        json_response(['ok' => false, 'error' => 'Payload too large'], 413);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_response(['ok' => false, 'error' => 'Invalid JSON body'], 400);
    }
    return [$data, $raw];
}

function normalize_hotel_id(?string $hotelId): string
{
    $hotelId = strtoupper(trim((string) $hotelId));
    if ($hotelId === '' || !preg_match('/^[A-Z0-9_-]{3,50}$/', $hotelId)) {
        json_response(['ok' => false, 'error' => 'Invalid or missing hotel_id'], 422);
    }
    return $hotelId;
}

function ensure_hotel_exists(PDO $pdo, string $hotelId, string $shopName = ''): void
{
    $stmt = $pdo->prepare('SELECT hotel_id FROM hotels WHERE hotel_id = ? AND status = 1 LIMIT 1');
    $stmt->execute([$hotelId]);
    if ($stmt->fetch()) {
        return;
    }

    /*
     * First sync can create the hotel automatically.
     * For stricter production licensing, remove this insert and require admin approval.
     */
    $insert = $pdo->prepare('
        INSERT INTO hotels (hotel_id, hotel_name, status)
        VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE hotel_name = VALUES(hotel_name), status = 1
    ');
    $insert->execute([$hotelId, $shopName !== '' ? $shopName : $hotelId]);
}

apply_cors();

