<?php
// --- DATABASE CONNECTION ---
// IMPORTANT: Replace with your actual database credentials
$servername = "localhost"; // Or your DB host
$username = "root";
$password = "";
$dbname = "db_pos";

header('Content-Type: application/json; charset=utf-8');
$conn = new mysqli($servername, $username, $password, $dbname);
$conn->set_charset("utf8mb4"); // Use utf8mb4 for full Unicode support

if ($conn->connect_error) {
    echo json_encode(['error' => 'Connection failed: ' . $conn->connect_error]);
    exit();
}

// --- PAGINATION SETUP ---
$results_per_page = 16;
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
$offset = ($page - 1) * $results_per_page;

// --- BUILD THE SQL WHERE CLAUSE ---
$base_sql_from = "FROM 
                    invoice AS inv
                LEFT JOIN 
                    user AS usr ON inv.invoice_employee_id = usr.user_id
                LEFT JOIN 
                    customer AS cust ON inv.invoice_customer_id = cust.customer_id";

$where_clause = " WHERE 1=1";
$params = [];
$types = '';

// Get filter values from the URL
$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';
$doc_number = $_GET['doc_number'] ?? '';
$employee_name = $_GET['employee_name'] ?? '';
$customer_name = $_GET['customer_name'] ?? '';

// Dynamically build where clause and parameters
if (!empty($date_from)) {
    $where_clause .= " AND DATE(inv.invoice_create_date) >= ?";
    $params[] = $date_from;
    $types .= 's';
}
if (!empty($date_to)) {
    $where_clause .= " AND DATE(inv.invoice_create_date) <= ?";
    $params[] = $date_to;
    $types .= 's';
}
if (!empty($doc_number)) {
    $where_clause .= " AND inv.invoice_number = ?";
    $params[] = $doc_number;
    $types .= 's';
}
if (!empty($employee_name)) {
    $where_clause .= " AND usr.user_name LIKE ?";
    $params[] = "%" . $employee_name . "%";
    $types .= 's';
}
if (!empty($customer_name)) {
    $where_clause .= " AND cust.customer_name LIKE ?";
    $params[] = "%" . $customer_name . "%";
    $types .= 's';
}


// --- QUERY 1: GET TOTAL COUNT OF RESULTS ---
$count_sql = "SELECT COUNT(inv.invoice_id) AS total " . $base_sql_from . $where_clause;
$stmt_count = $conn->prepare($count_sql);
if ($types) {
    $stmt_count->bind_param($types, ...$params);
}
$stmt_count->execute();
$total_count = $stmt_count->get_result()->fetch_assoc()['total'];
$stmt_count->close();


// --- QUERY 2: GET THE INVOICES FOR THE CURRENT PAGE ---
$invoices_sql = "SELECT 
                    inv.invoice_number, 
                    inv.invoice_create_date, 
                    usr.user_name AS employee_name,
                    cust.customer_name "
    . $base_sql_from . $where_clause .
    " ORDER BY inv.invoice_create_date DESC LIMIT ? OFFSET ?";

// Add LIMIT and OFFSET params to the list
$params[] = $results_per_page;
$params[] = $offset;
$types .= 'ii'; // Add 'i' for integer for both LIMIT and OFFSET

$stmt_invoices = $conn->prepare($invoices_sql);
$stmt_invoices->bind_param($types, ...$params);
$stmt_invoices->execute();
$result = $stmt_invoices->get_result();
$invoices = [];
while ($row = $result->fetch_assoc()) {
    $invoices[] = $row;
}
$stmt_invoices->close();
$conn->close();

// --- RETURN THE FINAL JSON OBJECT ---
$response = [
    'total_count' => $total_count,
    'invoices' => $invoices
];

echo json_encode($response, JSON_UNESCAPED_UNICODE);
