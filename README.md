# Ginsoft POS

Complete browser-first POS application built with HTML5, CSS3, Bootstrap 5, Vanilla JavaScript, SQLite via Capacitor, and Jeep SQLite web support.

## Project Architecture

- `index.html` - Base Bootstrap layout, sidebar, app shell, `<jeep-sqlite></jeep-sqlite>`.
- `css/styles.css` - Premium responsive POS styling for desktop and tablets.
- `js/` - App config, database adapter, router, utilities, UI helpers.
- `pages/` - Dashboard, billing, products, sales, reports, GST export, settings, printer, placeholders.
- `database/schema.sql` - SQLite schema for products, categories, sales, sale items, payments, settings, hold bills.
- `components/` - Reserved for reusable partials.
- `assets/` - Shop logos and uploaded/exported assets.
- `icons/` - App icon.
- `capacitor.config.json` - Android/Capacitor configuration.

## Installation

```bash
npm install
```

## Run in Browser

Use any HTTP server. Do not open `index.html` directly as a file because browser SQLite needs HTTP/IndexedDB context.

```bash
npm run serve
```

Then open:

```text
http://localhost:8080
```

Other supported options:

- VS Code Live Server from the project root.
- XAMPP/Apache by placing this folder under `htdocs`.
- Any simple HTTP server serving the project root.
- Capacitor browser mode after dependencies are installed.

## Browser SQLite Testing

The app automatically attempts to initialize:

1. `@capacitor-community/sqlite`
2. `jeep-sqlite` web component
3. IndexedDB/WebAssembly-backed web store

The base HTML already includes:

```html
<jeep-sqlite></jeep-sqlite>
```

If the SQLite package files are unavailable, the app uses an IndexedDB fallback so every POS module can still be tested in a normal browser. After `npm install`, the status pill should show `SQLite ready` when the Capacitor SQLite web path loads successfully.

## Capacitor Android Setup

If Android has not been added yet:

```bash
npm run cap:add:android
```

Sync web assets and plugins:

```bash
npm run cap:sync
```

Open Android Studio:

```bash
npm run cap:open
```

Build APK in Android Studio:

1. Select `Build`.
2. Select `Build Bundle(s) / APK(s)`.
3. Select `Build APK(s)`.

## POS Flow

1. Add or edit products in Products.
2. Open Billing.
3. Search or scan barcode text.
4. Add products to cart.
5. Apply discount if needed.
6. Choose Cash, UPI, or Card.
7. Save the bill to local database.
8. Print/reprint receipt.
9. Stock updates automatically.

## Tables

- `categories`
- `products`
- `sales`
- `sale_items`
- `settings`
- `payments`
- `hold_bills`

## Notes

- Core logic works in browser first.
- Android Bluetooth printing is prepared behind the printer module; browser printing is active now.
- Barcode and Backup modules are placeholder pages for the next phase.
