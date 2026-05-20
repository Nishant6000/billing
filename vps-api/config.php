<?php
declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Ginsoft POS VPS API Configuration
|--------------------------------------------------------------------------
| Edit these values after uploading to your VPS.
*/

const DB_HOST = 'localhost';
const DB_NAME = 'ginsoft_pos';
const DB_USER = 'YOUR_MYSQL_USERNAME';
const DB_PASS = 'YOUR_MYSQL_PASSWORD';
const DB_CHARSET = 'utf8mb4';

/*
| Optional shared secret.
| Keep blank during first testing if needed.
| If set, POS requests must send header:
| X-API-Key: your-secret-key
*/
const SYNC_API_KEY = '';

/*
| Allowed origins.
| Use ['*'] for testing, then restrict later.
*/
const ALLOWED_ORIGINS = ['*'];

const MAX_SYNC_PAYLOAD_BYTES = 52428800; // 50 MB

