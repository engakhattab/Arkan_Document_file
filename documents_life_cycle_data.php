<?php
header('Content-Type: application/json; charset=utf-8');

$servername = "localhost";
$username = "root";
$password = "";
$dbname = "db_pos";

$conn = new mysqli($servername, $username, $password, $dbname);
$conn->set_charset("utf8mb4");

if ($conn->connect_error) {
    echo json_encode(['error' => 'Connection failed: ' . $conn->connect_error], JSON_UNESCAPED_UNICODE);
    exit();
}

$defaultStart = new DateTime('first day of this month 00:00:00');
$defaultEnd = new DateTime('today 23:59:59');

$dateFrom = null;
if (!empty($_GET['date_from'])) {
    $dateFrom = DateTime::createFromFormat('Y-m-d', $_GET['date_from']);
    if ($dateFrom) {
        $dateFrom->setTime(0, 0, 0);
    }
}
if (!$dateFrom) {
    $dateFrom = clone $defaultStart;
}

$dateTo = null;
if (!empty($_GET['date_to'])) {
    $dateTo = DateTime::createFromFormat('Y-m-d', $_GET['date_to']);
    if ($dateTo) {
        $dateTo->setTime(23, 59, 59);
    }
}
if (!$dateTo) {
    $dateTo = clone $defaultEnd;
}

$dateFromValue = $dateFrom->format('Y-m-d H:i:s');
$dateToValue = $dateTo->format('Y-m-d H:i:s');

$sql = "SELECT
            it.type_id,
            it.type_name,
            it.type_hex_color,
            it.type_operation,
            it.type_sort_number,
            COUNT(inv.invoice_id) AS document_count,
            COALESCE(SUM(inv.invoice_total), 0) AS document_total
        FROM invoice_type AS it
        LEFT JOIN invoice AS inv
            ON inv.invoice_type_id = it.type_id
            AND COALESCE(inv.invoice_is_canceled, 0) <> 1
            AND inv.invoice_create_date BETWEEN ? AND ?
        WHERE COALESCE(it.type_is_deleted, 0) = 0
          AND COALESCE(it.type_is_disabled, 0) = 0
          AND it.type_sort_number IS NOT NULL
        GROUP BY it.type_id, it.type_name, it.type_hex_color, it.type_operation, it.type_sort_number
        ORDER BY it.type_sort_number ASC, it.type_id ASC";

$stmt = $conn->prepare($sql);
if (!$stmt) {
    echo json_encode(['error' => 'Failed to prepare statement'], JSON_UNESCAPED_UNICODE);
    $conn->close();
    exit();
}

$stmt->bind_param('ss', $dateFromValue, $dateToValue);
$stmt->execute();
$result = $stmt->get_result();

$stages = [];
$totalDocuments = 0;
$totalAmount = 0.0;

while ($row = $result->fetch_assoc()) {
    $count = (int) $row['document_count'];
    $amount = $row['document_total'] !== null ? (float) $row['document_total'] : 0.0;

    $stages[] = [
        'type_id' => (int) $row['type_id'],
        'type_name' => $row['type_name'],
        'type_hex_color' => $row['type_hex_color'],
        'type_operation' => $row['type_operation'],
        'type_sort_number' => $row['type_sort_number'] !== null ? (int) $row['type_sort_number'] : null,
        'document_count' => $count,
        'document_total' => $amount,
    ];

    $totalDocuments += $count;
    $totalAmount += $amount;
}

$stmt->close();
$conn->close();

$response = [
    'date_from' => $dateFrom->format('Y-m-d'),
    'date_to' => $dateTo->format('Y-m-d'),
    'stages' => $stages,
    'summary' => [
        'total_documents' => $totalDocuments,
        'total_amount' => $totalAmount,
    ],
];

echo json_encode($response, JSON_UNESCAPED_UNICODE);
?>