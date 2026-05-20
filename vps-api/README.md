# Ginsoft POS VPS API

Upload the contents of this folder to your VPS under:

```text
https://ginsoft.co/api/
```

Required files:

```text
api/config.php
api/db.php
api/health.php
api/pos-sync.php
api/license-check.php
```

## Setup

1. Import `database/mysql-web-sync-schema.sql` into MySQL.
2. Edit `config.php`.
3. Set your MySQL database name, username, and password.
4. Set a strong `SYNC_API_KEY`.
5. In POS Settings, set Web Sync URL:

```text
https://ginsoft.co/api/pos-sync.php
```

## Test

Open:

```text
https://ginsoft.co/api/health.php
```

Expected:

```json
{"ok":true,"service":"ginsoft-pos-api"}
```

