<?php
// --- DATABASE CONNECTION ---
$servername = "localhost"; // Or your DB host
$username = "root";
$password = "";
$dbname = "db_pos";

// --- Input ---
$term = $_GET['term'] ?? '';
$type = $_GET['type'] ?? '';

if (empty($type)) {
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

// Prepare query based on the type
$sql = "";
if ($type === 'employee') {
    $sql = "SELECT user_name FROM user WHERE user_name LIKE ? ORDER BY user_name ASC LIMIT 25";
} elseif ($type === 'customer') {
    $sql = "SELECT customer_name FROM customer WHERE customer_name LIKE ? ORDER BY customer_name ASC LIMIT 25";
} else {
    echo json_encode([]);
    exit();
}

$stmt = $conn->prepare($sql);
// IMPORTANT CHANGE: Find names that START WITH the term.
// If term is empty, this becomes "%" which matches everything.
$searchTerm = $term . "%";
$stmt->bind_param("s", $searchTerm);
$stmt->execute();

$result = $stmt->get_result();
$suggestions = [];
while ($row = $result->fetch_assoc()) {
    $suggestions[] = array_values($row)[0];
}

$stmt->close();
$conn->close();

header('Content-Type: application/json');
echo json_encode($suggestions, JSON_UNESCAPED_UNICODE);
