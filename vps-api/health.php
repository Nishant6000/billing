<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

try {
    pdo()->query('SELECT 1');
    json_response([
        'ok' => true,
        'service' => 'ginsoft-pos-api',
        'database' => 'connected',
        'time' => gmdate('c'),
    ]);
} catch (Throwable $error) {
    json_response([
        'ok' => false,
        'service' => 'ginsoft-pos-api',
        'database' => 'failed',
        'error' => $error->getMessage(),
    ], 500);
}

