<?php
// This script provides name suggestions for the autocomplete fields.

// --- DATABASE CONNECTION ---
$servername = "localhost";
$username = "your_db_user";
$password = "your_db_password";
$dbname = "db_pos";

// --- Input Sanitization ---
// Get the search term and the type (employee or customer)
$term = $_GET['term'] ?? '';
$type = $_GET['type'] ?? '';

if (empty($term) || empty($type)) {
    echo json_encode([]);
    exit();
}

// --- Database Connection ---
$conn = new mysqli($servername, $username, $password, $dbname);
$conn->set_charset("utf8");

if ($conn->connect_error) {
    echo json_encode([]);
    exit();
}

$sql = "";
// Prepare query based on the type
if ($type === 'employee') {
    $sql = "SELECT user_name FROM user WHERE user_name LIKE ? LIMIT 10";
} elseif ($type === 'customer') {
    $sql = "SELECT customer_name FROM customer WHERE customer_name LIKE ? LIMIT 10";
} else {
    echo json_encode([]);
    exit();
}

$stmt = $conn->prepare($sql);
$searchTerm = "%" . $term . "%";
$stmt->bind_param("s", $searchTerm);

$stmt->execute();
$result = $stmt->get_result();

$suggestions = [];
while ($row = $result->fetch_assoc()) {
    // Add the name string directly to the suggestions array
    $suggestions[] = array_values($row)[0];
}

$stmt->close();
$conn->close();

header('Content-Type: application/json');
echo json_encode($suggestions, JSON_UNESCAPED_UNICODE);
