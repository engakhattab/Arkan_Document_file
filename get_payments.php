<?php
// This script fetches all payment entries for a specific invoice ID.

// --- DATABASE CONNECTION ---
$servername = "localhost"; // Or your DB host
$username = "root";
$password = "";
$dbname = "db_pos";

header('Content-Type: application/json; charset=utf-8');
$conn = new mysqli($servername, $username, $password, $dbname);
$conn->set_charset("utf8mb4");

// --- GET INVOICE ID ---
$invoice_id = isset($_GET['invoice_id']) ? (int)$_GET['invoice_id'] : 0;

if ($invoice_id === 0) {
    echo json_encode(['error' => 'Invalid Invoice ID']);
    exit();
}

// --- QUERY FOR PAYMENT ENTRIES ---
// IMPORTANT: Assumes column names are 'entry_date' and 'entry_amount'.
// Please change these if your column names are different.
$sql = "SELECT entry_date, entry_amount FROM payment_entry WHERE entry_invoice_id = ? ORDER BY entry_date ASC";

$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $invoice_id);
$stmt->execute();
$result = $stmt->get_result();

$payments = [];
while ($row = $result->fetch_assoc()) {
    $payments[] = $row;
}

$stmt->close();
$conn->close();

echo json_encode($payments, JSON_UNESCAPED_UNICODE);
