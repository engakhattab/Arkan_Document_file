<?php
// This script now fetches ALL invoices one time for client-side filtering.

// --- DATABASE CONNECTION ---
$servername = "localhost"; // Or your DB host
$username = "root";
$password = "";
$dbname = "db_pos";

header('Content-Type: application/json; charset=utf-8');
$conn = new mysqli($servername, $username, $password, $dbname);
$conn->set_charset("utf8mb4");

if ($conn->connect_error) {
    echo json_encode(['error' => 'Connection failed: ' . $conn->connect_error]);
    exit();
}

// --- FETCH ALL INVOICES ---
$sql = "SELECT 
            inv.invoice_id,
            inv.invoice_number, 
            inv.invoice_create_date, 
            inv.invoice_total,
            usr.user_name AS employee_name,
            cust.customer_name,
            (SELECT COUNT(*) FROM payment_entry WHERE entry_invoice_id = inv.invoice_id) AS payment_count
        FROM 
            invoice AS inv
        LEFT JOIN 
            user AS usr ON inv.invoice_employee_id = usr.user_id
        LEFT JOIN 
            customer AS cust ON inv.invoice_customer_id = cust.customer_id
        ORDER BY inv.invoice_create_date DESC";

$result = $conn->query($sql);

$invoices = [];
while ($row = $result->fetch_assoc()) {
    $invoices[] = $row;
}

$conn->close();

echo json_encode($invoices, JSON_UNESCAPED_UNICODE);
