<?php
// --- DATABASE CONNECTION ---
// IMPORTANT: Replace with your actual database credentials
$servername = "localhost"; // Or your DB host
$username = "root";
$password = "";
$dbname = "db_pos";

header('Content-Type: application/json');
$conn = new mysqli($servername, $username, $password, $dbname);
$conn->set_charset("utf8");

if ($conn->connect_error) {
    echo json_encode(['error' => 'Connection failed: ' . $conn->connect_error]);
    exit();
}

// --- BUILD THE SQL QUERY WITH CORRECTED JOIN ---
$sql = "SELECT 
            inv.invoice_number, 
            inv.invoice_create_date, 
            usr.user_name AS employee_name, -- CHANGED: Get name from user table and alias it
            cust.customer_name
        FROM 
            invoice AS inv
        LEFT JOIN 
            user AS usr ON inv.invoice_employee_id = usr.user_id -- CHANGED: Join with user table
        LEFT JOIN 
            customer AS cust ON inv.invoice_customer_id = cust.customer_id
        WHERE 1=1";

$params = [];
$types = '';

// Get filter values from the URL
$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';
$doc_number = $_GET['doc_number'] ?? '';
$employee_name = $_GET['employee_name'] ?? '';
$customer_name = $_GET['customer_name'] ?? '';

// Add conditions to the query
if (!empty($date_from)) {
    $sql .= " AND DATE(inv.invoice_create_date) >= ?";
    $params[] = $date_from;
    $types .= 's';
}
if (!empty($date_to)) {
    $sql .= " AND DATE(inv.invoice_create_date) <= ?";
    $params[] = $date_to;
    $types .= 's';
}
if (!empty($doc_number)) {
    $sql .= " AND inv.invoice_number = ?";
    $params[] = $doc_number;
    $types .= 's';
}
if (!empty($employee_name)) {
    // CHANGED: Filter by user_name from the user table
    $sql .= " AND usr.user_name LIKE ?";
    $params[] = "%" . $employee_name . "%";
    $types .= 's';
}
if (!empty($customer_name)) {
    $sql .= " AND cust.customer_name LIKE ?";
    $params[] = "%" . $customer_name . "%";
    $types .= 's';
}

$sql .= " ORDER BY inv.invoice_create_date DESC";

// --- EXECUTE QUERY AND RETURN RESULTS ---
$stmt = $conn->prepare($sql);

if ($stmt === false) {
    echo json_encode(['error' => 'Prepare failed: ' . $conn->error], JSON_UNESCAPED_UNICODE);
    exit();
}

if ($types) {
    $stmt->bind_param($types, ...$params);
}

$stmt->execute();
$result = $stmt->get_result();
$documents = [];
while ($row = $result->fetch_assoc()) {
    $documents[] = $row;
}

$stmt->close();
$conn->close();

echo json_encode($documents, JSON_UNESCAPED_UNICODE);
