## Arkan_Document_file — Client-side Invoice Search (ERP)

This small web app provides a client-side searchable interface for invoices. It is built with plain HTML, CSS, JavaScript (vanilla) and PHP endpoints that read from a MySQL database. The UI and dataset are Arabic-oriented (RTL). The current implementation loads all invoices once and performs filtering, live search, sorting and pagination on the client.

This README explains what each file does, the expected data shapes and DB assumptions, how to run the project locally (XAMPP), how to extend it, and a prioritized list of improvements.

---

## Table of contents
- Project overview
- Files and responsibilities
- API / Data contracts
- Database schema assumptions
- How to run locally (Windows + XAMPP)
- How to modify & extend (front-end + back-end)
- Security, performance and edge cases
- Recommended improvements / roadmap

---

## Project overview

This front-end allows users to search and filter invoices using:
- Date range
- Invoice number (exact-match in current implementation)
- Employee name (autocomplete)
- Customer name (autocomplete)
- Live search (searches across invoice fields client-side)

Invoices are displayed in a paginated table where you can sort by columns and open a modal to view payment entries for a specific invoice.

Key design decision in this repo: search.php currently returns all invoices in one request. The client (script.js) then performs filtering/sorting/pagination in the browser. This is simple and fast for small datasets but will not scale to large invoice counts.

---

## Files and responsibilities

- `index.html` — Main UI. Contains markup and embedded CSS variables and styles for the app (RTL layout). Includes the live search input, filters form, results table, payments modal, and loads `script.js`.
- `script.js` — Client-side logic. Responsible for:
  - Loading the initial invoice dataset from `search.php` (fetch once)
  - Applying main filters (date, invoice number, employee/customer names)
  - Live searching across displayed fields
  - Sorting and client-side pagination
  - Autocomplete UI that calls `autocomplete.php`
  - Opening the payments modal and loading details from `get_payments.php`
  - UI helpers: date presets, highlight matches, summary bar, sort icons
- `search.php` — Currently returns all invoices as JSON for client-side filtering. Uses MySQLi to fetch invoice rows and includes `payment_count` for each invoice.
- `autocomplete.php` — Returns up to 25 suggestions (employee or customer) based on a prefix search. Uses prepared statements and `LIKE ?` with `term%`.
- `get_payments.php` — Returns all payment entries for an invoice (entry_date, entry_amount) as JSON.

---

## API / Data contracts

All responses are JSON and encoded using UTF-8.

1) GET `search.php` (current behavior)
  - Response: array of invoice objects
  - Invoice object (example keys returned by SQL):
    - invoice_id (int)
    - invoice_number (string|int)
    - invoice_create_date (string, e.g. "2025-09-24 13:45:00")
    - invoice_total (numeric|string)
    - employee_name (string|null)
    - customer_name (string|null)
    - payment_count (int)

2) GET `autocomplete.php?type=employee|customer&term=...`
  - Response: array of suggestion strings (e.g. ["Ahmed Ali", "Alaa ..."]).
  - Behavior: returns names that START WITH the provided term (`term%`) limited to 25 rows.

3) GET `get_payments.php?invoice_id=NNN`
  - Response: array of payment objects
  - Payment object keys (as assumed in code):
    - entry_date (string)
    - entry_amount (numeric|string)

If you change column names in the database, update the SQL queries in each PHP file and the JS code that depends on field names.

---

## Database schema assumptions

The implementation assumes the following tables/columns exist in a database named `db_pos` (used by the code):

- `invoice` table (example minimal columns):
  - invoice_id (PK)
  - invoice_number
  - invoice_create_date (datetime)
  - invoice_total
  - invoice_employee_id (FK -> user.user_id)
  - invoice_customer_id (FK -> customer.customer_id)

- `user` table:
  - user_id
  - user_name

- `customer` table:
  - customer_id
  - customer_name

- `payment_entry` table (used by `get_payments.php` and payment_count subquery):
  - entry_id
  - entry_invoice_id (FK -> invoice.invoice_id)
  - entry_date
  - entry_amount

If your real schema uses different names, change the SELECT clauses and column names in the PHP files accordingly.

---

## How to run locally (Windows + XAMPP)

1. Copy the folder `erpClientSide` to `C:\xampp\htdocs\` (already appears to be there).
2. Start XAMPP Control Panel and run Apache and MySQL.
3. Create the database and tables (example SQL below to create minimal tables and seed one row):

```sql
CREATE DATABASE IF NOT EXISTS db_pos DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE db_pos;

-- Minimal tables (adjust to your actual schema)
CREATE TABLE user (user_id INT AUTO_INCREMENT PRIMARY KEY, user_name VARCHAR(191));
CREATE TABLE customer (customer_id INT AUTO_INCREMENT PRIMARY KEY, customer_name VARCHAR(191));
CREATE TABLE invoice (
  invoice_id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(50),
  invoice_create_date DATETIME,
  invoice_total DECIMAL(12,2),
  invoice_employee_id INT NULL,
  invoice_customer_id INT NULL
);
CREATE TABLE payment_entry (
  entry_id INT AUTO_INCREMENT PRIMARY KEY,
  entry_invoice_id INT,
  entry_date DATE,
  entry_amount DECIMAL(12,2)
);

-- Example seed
INSERT INTO user (user_name) VALUES ('Ali');
INSERT INTO customer (customer_name) VALUES ('شركة المثال');
INSERT INTO invoice (invoice_number, invoice_create_date, invoice_total, invoice_employee_id, invoice_customer_id)
VALUES ('1001', '2025-09-01 09:00:00', 1200.00, 1, 1);
INSERT INTO payment_entry (entry_invoice_id, entry_date, entry_amount) VALUES (1, '2025-09-02', 500.00);
```

4. Open your browser and navigate to `http://localhost/erpClientSide/index.html`.

Notes: the PHP files use `localhost`, user `root` and empty password by default. Change the DB connection variables inside the PHP files if your MySQL uses different credentials.

---

## How to modify & extend

These are common development tasks with quick guidance.

- Change database credentials: update the connection variables at the top of each PHP file (`search.php`, `autocomplete.php`, `get_payments.php`). Consider centralizing the DB connection into a single `config.php` and include it from each PHP file.

- Add server-side filtering / pagination (recommended for large datasets):
  - Modify `search.php` to accept query parameters (date_from, date_to, invoice_number, employee_name, customer_name, page, per_page, sort_by, sort_order).
  - Build a parametrized SQL query with WHERE clauses and LIMIT/OFFSET.
  - Return a JSON object { invoices: [...], total_count: N, total_sum: S } so the client can render pages and summary efficiently.

- Secure inputs: always use prepared statements (autocomplete.php and get_payments.php already use them). Update `search.php` to use prepared statements if you add query parameters.

- Move inline styles from `index.html` to a separate CSS file (`styles.css`) to make the HTML slimmer and easier to maintain. Also consider extracting Arabic fonts and RTL helpers.

- Convert to modular JS: split `script.js` into smaller modules (state, api, ui). This makes it easier to test and extend.

- Add authentication & permissions: wrap the PHP endpoints with simple session checks or token-based auth depending on your requirements.

- Add unit / integration tests: create simple PHPUnit tests for the PHP endpoints and Jest (or similar) tests for front-end logic if you convert JS to modules or use a bundler.

---

## Security, performance and edge cases

- Performance: loading all invoices on the client is fine for a few thousand rows but will cause high memory use and slow UI for very large datasets. Prefer server-side pagination and filtering for production.
- SQL injection: `autocomplete.php` and `get_payments.php` use prepared statements. If you add dynamic WHERE clauses in `search.php`, use prepared statements and sanitize inputs.
- XSS: be careful when inserting HTML into the page. `script.js` currently injects highlighted matches as HTML. Ensure any user-generated content is sanitized before rendering. Consider using textContent where possible and only use innerHTML after escaping user content.
- Date handling: `script.js` parses dates using `new Date(...)` with strings extracted from SQL. Ensure date format is consistent (ISO / yyyy-mm-dd hh:mm:ss) to prevent timezone/parsing issues.
- Charset: ensure MySQL tables use utf8mb4 and PHP outputs JSON with UTF-8 header (current code sets JSON header and uses JSON_UNESCAPED_UNICODE when echoing).

---

## Recommended improvements (prioritized)

1. Server-side filtering & pagination in `search.php`. Return only the rows needed for the page and a total count and aggregates. This is the highest priority when dataset grows.
2. Centralize DB config into `config.php` and switch to PDO (with exceptions enabled). PDO makes binding dynamic WHERE clauses easier and portable.
3. Sanitize and escape data when inserting into HTML to prevent XSS (especially for invoice_number and names). Replace direct innerHTML uses with safe text insertion.
4. Move CSS to `styles.css` and structure the front-end into smaller modules (e.g., `api.js`, `ui.js`, `filters.js`).
5. Add server-side authentication and authorization if this app will be used beyond trusted local networks.
6. Add export (CSV/XLS) and print-friendly views for reporting.
7. Add tests: PHP integration tests for endpoints and a couple of front-end unit tests for filtering/sorting logic.

---

## Quick developer checklist & tips

- Where fields come from:
  - If you need a new field in the table, add it to the SELECT in `search.php` and update `script.js` to display it.
- To change autocomplete behavior (e.g., contains vs starts-with), change the SQL `LIKE` pattern in `autocomplete.php` (use `%term%` for contains).
- To support different currencies/locales, update `Intl.NumberFormat` calls in `script.js`.
- To switch to server-side search, replace the initial fetch in `script.js` with calls that include active form filters (date, name, invoice number) and let `search.php` return paginated results.

