
# Ginsoft POS Complete Software Documentation

Document Type: Software Requirement Specification (SRS), Technical Design Document (TDD), System Architecture Document, API Documentation, Database Documentation, Developer Guide, Deployment Guide
Project Name: Ginsoft POS
Prepared For: Ginsoft Private Limited
Architecture: Offline-first browser and Android POS application
Actual Backend: No remote backend/server is required for core operation. The project includes a lightweight Node.js static development server named dev-server.mjs for browser testing. PHP/REST backend is not currently implemented and is listed as a future integration option.
Database: Local SQLite through Capacitor Community SQLite with browser fallback using Jeep SQLite/IndexedDB.
Mobile Runtime: Capacitor Android.

---

# 1. Project Overview

## 1.1 Purpose
Ginsoft POS is a professional offline-first Point of Sale billing application for retail stores, supermarkets, grocery shops, medical stores, wholesale shops, hotels, restaurants, cafes, bakeries, and small businesses. The application works as a browser application during development and as an Android APK using Capacitor.

The product focuses on fast billing, local data ownership, GST-ready invoicing, inventory control, purchase entry, reports, backup/restore, table-based hotel billing, barcode scanning, dynamic quantity pricing, weight billing preparation, WhatsApp bill sharing, and WhatsApp marketing.

## 1.2 Business Problems Solved
- Enables billing without continuous internet.
- Provides quick POS operation for retail and restaurant workflows.
- Handles GST, discounts, returns, deleted bills, modified bills, and pending saved bills.
- Supports grocery, liquid, weight, count, and medical tablet-sheet billing.
- Supports browser testing before Android conversion.
- Stores core business data locally using SQLite or browser fallback storage.
- Reduces manual accounting effort through reports and GST exports.
- Allows customer mobile capture for WhatsApp billing and marketing.

## 1.3 Target Users
- Grocery stores
- Supermarkets
- Medical stores
- Wholesale shops
- Restaurants and hotels
- Cafes, bakeries, juice shops
- Small retailers requiring offline billing
- Android tablet POS users

## 1.4 Key Features
- Dashboard with sales summary and charts
- Direct billing and table-based hotel billing
- Product management with image, barcode, GST, stock, shelf, box, and description
- Dynamic quantity pricing and unit conversion
- Packing hierarchy: Box -> Packet -> Sheet -> Tablet
- Hold bill and running table order support
- KOT generation for restaurant mode
- Sales history with view, print, WhatsApp, return, delete, and modify
- Purchase bill entry and purchase history
- GST export with purchase and sales data
- Reports including paid, returned, deleted, modified, and saved unpaid bills
- Backup and restore
- Barcode camera and Bluetooth scanner support
- Weight capture placeholder for future Bluetooth weighing machine integration
- WhatsApp bill sharing and WhatsApp marketing module
- Settings for shop, GST, printer, billing mode, and weight mode
- Capacitor Android compatibility
- Startup splash screen for branding

## 1.5 Industry Use Cases
| Industry | Use Case |
|---|---|
| Grocery | Sell rice, oil, pulses in partial quantities using weight/liquid conversion. |
| Medical | Sell tablets from sheet/box hierarchy. |
| Supermarket | Barcode billing, product image display, stock and GST control. |
| Wholesale | Bulk and packet-based billing, purchases and GST export. |
| Hotel/Restaurant | Table orders, KOT, saved unpaid bills, final payment. |
| Mobile Retail | Android tablet POS with offline local database. |

# 2. Technologies Used

## 2.1 Frontend Technologies
HTML5 is used for the application shell, semantic structure, forms, tables, and modals. It is simple, stable, and Capacitor-compatible. Limitation: complex interactions require JavaScript. Alternatives: React, Vue, Angular, Svelte.

CSS3 is used for premium POS design, responsive layout, gradients, shadows, sidebar, splash screen, and touch-friendly UI. Limitation: large stylesheets require discipline. Alternatives: SCSS, Tailwind CSS, CSS Modules.

Bootstrap 5 is used for grids, modals, forms, buttons, tables, toasts, and responsive utilities. Advantage: fast production UI. Limitation: custom styling is needed to avoid generic Bootstrap appearance. Alternatives: Tailwind CSS, Bulma, Material UI.

Vanilla JavaScript ES Modules are used for routing, UI rendering, database calls, billing logic, reports, barcode, backup, and business rules. Advantage: no framework dependency and strong offline compatibility. Limitation: manual state management. Alternatives: React, Vue, Svelte.

FontAwesome provides icons for navigation, buttons, POS actions, barcode, WhatsApp, settings, printing, and dashboard. Alternatives: Lucide, Bootstrap Icons, Material Icons.

Chart.js is used for dashboard and report charts. Alternatives: ECharts, ApexCharts, D3.js.

## 2.2 Backend Technologies
The current project has no remote backend. Core operation is local only. Node.js static server dev-server.mjs serves files during development. It is not a business API server. PHP backend is not currently implemented. A PHP or Node REST backend can be added later for cloud sync, multi-store, login, SaaS subscriptions, and centralized reporting.

## 2.3 Database Technologies
SQLite is the primary database through @capacitor-community/sqlite. It is reliable, local, transactional, fast, and serverless. Limitation: multi-device sync requires a backend. Alternatives: IndexedDB, Realm, PostgreSQL, MySQL, Firebase.

Browser support uses Jeep SQLite where available and IndexedDB fallback when the SQLite plugin cannot initialize. This enables testing in Live Server, XAMPP, Apache, and simple HTTP servers.

## 2.4 Mobile Framework
Capacitor wraps the web application in Android WebView and provides plugin access. It allows the same HTML/CSS/JS project to become an Android APK. Alternatives: Cordova, React Native, Flutter, native Android Kotlin.

## 2.5 APIs and Storage
Current APIs are internal JavaScript service methods in js/db.js. There are no REST endpoints. Storage includes SQLite, IndexedDB fallback, localStorage for UI preferences/templates, sessionStorage for barcode handoff, and downloadable JSON/CSV files.

## 2.6 Printing, Barcode, Offline, and Security
Printing currently uses window.print() with receipt formatting for 58mm and 80mm use cases. Future native printing should use Bluetooth ESC/POS.
Barcode support includes camera BarcodeDetector and Bluetooth scanner keyboard input.
The application is offline-first because app files and database are local. Internet is mainly required for CDN assets and WhatsApp links unless assets are bundled locally.
Security includes escaped UI rendering, parameterized SQL values, local-only storage, backup validation, and a future roadmap for login, roles, encryption, and audit controls.

# 3. System Architecture

## 3.1 High-Level Architecture
DIAGRAM:
+--------------------------------------------------+
| Ginsoft POS UI                                   |
| HTML5 + CSS3 + Bootstrap + Vanilla JS Modules    |
+------------------------+-------------------------+
                         |
                         v
+--------------------------------------------------+
| Application Layer                                |
| Router, Pages, UI Helpers, Billing Engine        |
+------------------------+-------------------------+
                         |
                         v
+--------------------------------------------------+
| Data Layer                                       |
| js/db.js Database Service                        |
| SQLite Plugin OR IndexedDB Fallback              |
+------------------------+-------------------------+
          |                                      |
          v                                      v
+-------------------+                  +-------------------+
| Native SQLite     |                  | Browser IndexedDB  |
| Android/Capacitor |                  | Development Mode   |
+-------------------+                  +-------------------+

## 3.2 Data Flow Architecture
DIAGRAM:
User Action -> Page JS -> Validation -> Business Logic -> db.js -> SQLite/IndexedDB
UI Update <- Toast/Modal/Table Render <- Query Result <- Database Response

## 3.3 Offline-First Architecture
The software stores products, bills, purchases, settings, reports, table orders, and backups locally. The database layer first tries SQLite, then falls back to IndexedDB in browser mode. Manual backup/restore is used for data portability. Future cloud sync can add a sync queue and REST endpoints.

## 3.4 Android Architecture
DIAGRAM:
Android APK -> Capacitor WebView -> index.html -> JS modules -> CSS/assets/icons -> SQLite native plugin -> Local SQLite database

## 3.5 Browser Architecture
DIAGRAM:
HTTP Server / Live Server / Apache -> index.html -> ES modules -> Jeep SQLite if available -> IndexedDB fallback if SQLite plugin unavailable

## 3.6 Billing Workflow Architecture
DIAGRAM:
Product Search/Barcode -> Cart -> Pricing Engine -> GST/Discount -> Payment Modal -> saveSale() -> SQLite -> Receipt/Print/WhatsApp -> Reports

# 4. Complete Module Breakdown

## Dashboard
Purpose: Daily business overview. Features: today sales, today bills, total bills, GST collected, charts, recent bills. Inputs: sales rows and current date. Outputs: metrics and charts. Tables: sales. Frontend: pages/dashboard.js. Backend/data methods: db.dashboardStats(), db.getSales().

## Billing
Purpose: Create retail bills and restaurant table bills. Features: direct billing, table billing, cart, quantity conversion, GST, discounts, cash balance, hold bill, payment, receipt, WhatsApp, barcode camera, weight capture placeholder. Inputs: product, quantity, unit, discount, payment type, customer info. Outputs: sales, sale_items, payments, stock updates, receipts. Tables: products, sales, sale_items, payments, hold_bills, table_orders, table_order_items. Frontend: pages/billing.js.

## Inventory / Products
Purpose: Manage product catalog and stock. Features: add/edit/delete product, category, barcode, price, GST, stock, image, shelf, box, description, display options, and packing conversion. Tables: products, categories. Frontend: pages/products.js. Validations: product name required, numeric price/GST/stock, image file checking, alphanumeric shelf/box.

## Customers
Purpose: Capture customer name and phone during billing. Used for WhatsApp bill sharing, sales search, and marketing. Tables: sales. Frontend: pages/billing.js, pages/sales.js, pages/whatsapp-marketing.js.

## Suppliers
Current supplier data is captured in purchase bills through supplier name and GSTIN. Future enhancement: suppliers master table.

## GST
Purpose: Calculate and export GST. Features: product GST, sale GST, purchase GST, net GST, CSV/XLS compatible export. Tables: products, sales, sale_items, purchases, purchase_items. Frontend: pages/gst-export.js and pages/reports.js.

## Reports
Purpose: Business reporting. Features: sales summary, paid bills, returned bills, deleted bills, modified bills, saved unpaid bills, product sales, payment report, exports. Tables: sales, sale_items, bill_audit, table_orders, table_order_items. Frontend: pages/reports.js.

## Expenses
Not implemented. Recommended future tables: expenses and expense_categories. Future features: expense entry, category, payment mode, daily/monthly reports.

## Users & Roles
Not implemented. Recommended future roles: Owner, Manager, Cashier, Inventory, Accountant. Future features: PIN login, permissions, audit logs.

## Settings
Purpose: Configure the business and app behavior. Features: shop details, GST, bill prefix, paper size, billing mode, weight billing, footer text. Table: settings. Frontend: pages/settings.js.

## Backup & Restore
Purpose: Local data protection. Features: JSON backup export and restore. Tables: all backup tables. Frontend: pages/backup.js.

## Barcode Scanner
Purpose: Fast product lookup. Features: camera scanner, Bluetooth scanner input, auto-add to billing, scanner settings. Tables: products, settings. Frontend: pages/barcode.js and pages/billing.js.

## Thermal Printing
Current implementation uses browser print. Future implementation should use Bluetooth ESC/POS for 58mm/80mm thermal printers.

## Hold Bills
Purpose: Temporarily store a cart. Table: hold_bills. Flow: Hold Bill -> save cart_json -> Resume Hold -> reload cart -> delete hold.

## Purchase Management
Purpose: Record purchase bills and input GST. Tables: purchases, purchase_items. Frontend: pages/purchase.js.

## Stock Management
Purpose: Maintain product stock. Stock reduces when sales are completed. For dynamic quantity pricing, stock reduces proportionally against base quantity.

## WhatsApp Marketing
Purpose: Send prepared marketing messages to customer contacts. Features: customer list from sales, CSV import, TXT message upload, placeholders, consent checkbox, open next chat, prepare all links. Frontend: pages/whatsapp-marketing.js.

# 5. Page-Wise Frontend and Backend Documentation

| Page/Route | Frontend File | Data Layer | Tables | Main Functions |
|---|---|---|---|---|
| Dashboard | pages/dashboard.js | js/db.js | sales | renderDashboard, dashboardStats |
| Billing | pages/billing.js | js/db.js, js/utils.js | products, sales, sale_items, payments, hold_bills | renderBilling, addProductToCart, saveSale |
| Tables | pages/tables.js | js/db.js | dining_tables, table_orders | renderTables, saveDiningTable |
| Products | pages/products.js | js/db.js | products, categories | renderProducts, saveProduct |
| Purchase Entry | pages/purchase.js | js/db.js | purchases, purchase_items | renderPurchaseEntry, savePurchase |
| Purchase History | pages/purchase.js | js/db.js | purchases, purchase_items | renderPurchaseHistory |
| Sales | pages/sales.js | js/db.js | sales, sale_items, payments, bill_audit | renderSales, showSale, updateSale |
| Reports | pages/reports.js | js/db.js | sales, sale_items, bill_audit, table_orders | renderReports, runReport |
| GST Export | pages/gst-export.js | js/db.js | sales, sale_items, purchases, purchase_items | renderGstExport |
| Settings | pages/settings.js | js/db.js | settings | renderSettings, saveSetting |
| Printer | pages/printer.js | Browser print | settings | renderPrinter |
| Barcode | pages/barcode.js | js/db.js | products, settings | renderBarcode, startCamera, handleBarcode |
| Backup | pages/backup.js | js/db.js | all backup tables | exportBackup, restoreBackup |
| WhatsApp Marketing | pages/whatsapp-marketing.js | js/db.js | sales | renderWhatsappMarketing |

Files work together as follows: index.html loads js/app.js. app.js initializes database and router. router.js maps hash routes to page render functions. Each page calls db.js methods. db.js chooses SQLite or IndexedDB. ui.js provides modals, toast messages, and title updates. utils.js contains calculation, formatting, escaping, CSV export, dynamic pricing, and unit conversion helpers.

# 6. Database Documentation

## 6.1 Main Tables
categories, products, sales, sale_items, payments, dining_tables, table_orders, table_order_items, kot_tickets, kot_items, purchases, purchase_items, bill_audit, hold_bills, settings.

## 6.2 Table Descriptions
products stores product catalog including barcode, price, base quantity/unit, GST, stock, location, image, discount, and packing conversion.
sales stores final bills including totals, payment type, customer name/phone, status, and timestamp.
sale_items stores line items per sale including quantity, unit, GST, and total.
payments stores payment records.
dining_tables stores hotel/restaurant tables.
table_orders stores open and closed running orders.
table_order_items stores saved unpaid order items.
kot_tickets and kot_items store kitchen order ticket history.
purchases and purchase_items store purchase bills and input GST.
bill_audit stores deleted, modified, and returned bill history.
hold_bills stores temporary carts.
settings stores key-value app settings.

## 6.3 Relationships
DIAGRAM:
categories 1----* products
sales 1----* sale_items
sales 1----* payments
dining_tables 1----* table_orders
table_orders 1----* table_order_items
table_orders 1----* kot_tickets
kot_tickets 1----* kot_items
purchases 1----* purchase_items

## 6.4 Sample SQL and Optimization
Recommended indexes: idx_products_barcode on products(barcode), idx_sales_invoice on sales(invoice_no), idx_sales_created_at on sales(created_at), idx_sale_items_sale_id on sale_items(sale_id).
Use parameterized queries, transactions for bulk restore, compressed images, pagination for large reports, and periodic VACUUM for long-running deployments.

# 7. API Documentation
Current APIs are internal JavaScript service methods rather than REST endpoints.

Internal API examples:
db.getProducts(search) returns matching product rows.
db.saveSale(payload) stores sale, line items, payment, and stock updates.
db.exportBackup() returns JSON backup structure.
db.restoreBackup(backup) replaces local data with backup data.

Future REST APIs: POST /api/auth/login, GET /api/products, POST /api/sales, POST /api/sync/push, GET /api/sync/pull. Future REST APIs should use JWT authentication, error codes, conflict resolution, and role checks.

# 8. Billing Workflow
1. User opens Billing.
2. App checks billing mode.
3. Direct mode shows product grid and current bill.
4. Table mode shows table cards and running orders.
5. Product is selected by tap, search, barcode camera, or Bluetooth scanner.
6. Cart item starts with base quantity and base unit.
7. User adjusts quantity and unit.
8. Dynamic pricing calculates Final Price = Customer Quantity / Base Quantity x Base Price.
9. Product discount applies before GST.
10. Manual bill discount is proportionally distributed before GST.
11. GST is calculated line-wise.
12. Payment modal collects payment method, cash received, customer name, and phone.
13. Sale is saved to sales, sale_items, payments.
14. Stock is deducted proportionally.
15. Receipt is shown.
16. User prints, saves PDF, or sends WhatsApp bill.
17. Reports and GST export use saved sale data.

# 9. Security Documentation
Authentication and authorization are not currently implemented. Future versions should add PIN/password login, role-based permissions, session timeout, encrypted SQLite, encrypted backups, and audit trails.
SQL injection prevention is handled by parameter arrays in SQLite calls. UI text is escaped before rendering. Local storage should not store passwords. Backup files are currently readable JSON and should be encrypted in future production deployments.

# 10. Android App Structure
Capacitor wraps the web application inside Android WebView. capacitor.config.json defines appId, appName, and webDir. Native SQLite is provided by @capacitor-community/sqlite. Recommended Android permissions include CAMERA, BLUETOOTH_CONNECT, BLUETOOTH_SCAN, INTERNET, and storage permissions depending on backup implementation. Thermal printer and weighing scale integration are future native plugin phases.

Build commands:
npm install
npx cap sync android
npx cap open android
Build APK/AAB from Android Studio.

# 11. Folder Structure
/ index.html, manifest.webmanifest, capacitor.config.json, dev-server.mjs, package.json, README.md
/css for global styles
/js for app core, router, database service, utilities
/pages for route modules
/database for SQL schema
/assets for static assets
/icons for app icons
/components for reusable component area
/android for Capacitor Android project
/docs for generated documentation

Recommended enterprise expansion: /frontend, /backend, /database, /assets, /components, /apis, /helpers, /services, /android, /www, /docs, /tests.

# 12. Deployment Documentation
Local browser deployment: npm install, then npm run serve, then open http://localhost:8080. VS Code Live Server and XAMPP/Apache can serve the project over HTTP. Do not use file:// for SQLite web testing. Android deployment uses Capacitor sync and Android Studio. Production should bundle CDN assets locally and generate signed APK/AAB.

# 13. Performance Optimization
Use SQLite indexes, transactions, compressed images, route-level lazy loading in future, local asset caching, barcode index lookup, minimal DOM updates for large carts, and stock movement tables for audit-grade inventory.

# 14. Future Scalability
Future roadmap includes cloud sync, multi-store support, SaaS conversion, multi-user architecture, real-time sync, analytics integration, encrypted backups, native Bluetooth printer, native Bluetooth scale, and automated tests.

# 15. Testing Documentation
Functional tests: add/edit/delete product, save bill, return bill, delete bill, backup, restore, barcode, WhatsApp, table order, KOT.
Billing tests: product selection, quantity, unit conversion, GST, discount, cash balance, receipt, WhatsApp.
GST tests: sale GST, purchase GST, net GST, discount before GST.
Offline tests: save data offline, refresh, Android airplane mode.
Android tests: SQLite creation, camera permissions, barcode scan, Bluetooth scanner keyboard input, print preview.
Performance tests: 1,000 products search, 10,000 sales report, backup size, restore speed, billing response under one second.

# 16. Complete Working Flow
Start App -> Splash Screen -> Initialize SQLite/IndexedDB -> Dashboard -> Product Setup -> Billing -> Product Selection / Barcode / Quantity -> GST + Discount -> Payment -> Customer Capture -> Save Sale -> Update Stock -> Receipt Print/PDF/WhatsApp -> Sales History -> Reports/GST Export -> Backup.

Hotel mode: Settings -> Table Based Billing -> Tables Setup -> Billing Table Grid -> Open Table -> Add Items -> Save Order / Print KOT -> Saved Unpaid Bill Report -> Generate Bill -> Payment -> Close Table -> Sales and Reports.

# 17. Developer Guide
To add a page, create a page module, import it in router.js, add route in config.js, and add styles if required. To add a table, update schema.sql, add fallback object store, add backup arrays, add migration helper, and add CRUD methods. To add a setting, add default in config.js, form control in settings.js, read with db.getSettings(), save with db.saveSetting().

Coding guidelines: use ES modules, async/await, centralize calculations in utils.js, keep database access in db.js, escape user text, keep UI touch-friendly, and avoid unrelated refactors.

# 18. Known Limitations
No login/users yet. No remote backend/cloud sync yet. WhatsApp cannot auto-send messages or auto-attach PDF due browser/WhatsApp restrictions. Native Bluetooth printer and weighing scale integrations are placeholders/future phases. Browser IndexedDB fallback differs from native SQLite. CDN assets should be bundled locally for fully offline production APK.

# 19. Recommended Roadmap
1. Bundle Bootstrap, FontAwesome, and Chart.js locally.
2. Add users and roles.
3. Add stock_movements and suppliers master.
4. Add expenses module.
5. Add native Bluetooth printer plugin.
6. Add Bluetooth weighing scale plugin.
7. Add encrypted backup.
8. Add cloud sync backend.
9. Add multi-store SaaS admin.
10. Add automated test suite.
