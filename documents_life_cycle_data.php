<?php
header('Content-Type: application/json; charset=utf-8');

$servername = "localhost";
$username = "root";
$password = "";
$dbname = "db_pos";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    echo json_encode(['error' => 'Connection failed: ' . $conn->connect_error], JSON_UNESCAPED_UNICODE);
    exit();
}

$conn->set_charset("utf8mb4");

$defaultStart = new DateTime('first day of this month 00:00:00');
$defaultEnd = new DateTime('today 23:59:59');

$dateFrom = null;
if (!empty($_GET['date_from'])) {
    $dateFrom = DateTime::createFromFormat('Y-m-d', $_GET['date_from']);
    if ($dateFrom instanceof DateTime) {
        $dateFrom->setTime(0, 0, 0);
    }
}
if (!$dateFrom) {
    $dateFrom = clone $defaultStart;
}

$dateTo = null;
if (!empty($_GET['date_to'])) {
    $dateTo = DateTime::createFromFormat('Y-m-d', $_GET['date_to']);
    if ($dateTo instanceof DateTime) {
        $dateTo->setTime(23, 59, 59);
    }
}
if (!$dateTo) {
    $dateTo = clone $defaultEnd;
}

$customerId = isset($_GET['customer_id']) && $_GET['customer_id'] !== '' ? (int) $_GET['customer_id'] : null;
if ($customerId !== null && $customerId <= 0) {
    $customerId = null;
}

$supplierId = isset($_GET['supplier_id']) && $_GET['supplier_id'] !== '' ? (int) $_GET['supplier_id'] : null;
if ($supplierId !== null && $supplierId <= 0) {
    $supplierId = null;
}

$dateFromValue = $dateFrom->format('Y-m-d H:i:s');
$dateToValue = $dateTo->format('Y-m-d H:i:s');

$stagesSql = "SELECT 
                type_id, 
                type_name, 
                type_hex_color, 
                type_operation, 
                type_sort_number
             FROM invoice_type
             WHERE COALESCE(type_is_deleted, 0) = 0
               AND COALESCE(type_is_disabled, 0) = 0
               AND type_sort_number IS NOT NULL
             ORDER BY type_sort_number ASC, type_id ASC";

$stagesResult = $conn->query($stagesSql);

if ($stagesResult === false) {
    echo json_encode(['error' => 'Failed to load invoice stages.'], JSON_UNESCAPED_UNICODE);
    $conn->close();
    exit();
}

$stages = [];
while ($stageRow = $stagesResult->fetch_assoc()) {
    $stages[] = [
        'type_id' => (int) $stageRow['type_id'],
        'type_name' => $stageRow['type_name'],
        'type_hex_color' => $stageRow['type_hex_color'],
        'type_operation' => $stageRow['type_operation'],
        'type_sort_number' => (int) $stageRow['type_sort_number'],
    ];
}

$stagesResult->free();

$rows = [];
$totalDocuments = 0;
$totalAmount = 0.0;

$dataSql = "SELECT 
                inv.invoice_customer_id,
                cust.customer_name,
                inv.invoice_supplier_id,
                sup.supplier_name,
                MAX(inv.invoice_create_date) AS latest_invoice_date,
                inv.invoice_type_id,
                COUNT(inv.invoice_id) AS document_count,
                COALESCE(SUM(inv.invoice_total), 0) AS document_total
            FROM invoice AS inv
            INNER JOIN invoice_type AS it ON inv.invoice_type_id = it.type_id
            LEFT JOIN customer AS cust ON inv.invoice_customer_id = cust.customer_id
            LEFT JOIN supplier AS sup ON inv.invoice_supplier_id = sup.supplier_id
            WHERE COALESCE(inv.invoice_is_canceled, 0) <> 1
              AND COALESCE(it.type_is_deleted, 0) = 0
              AND COALESCE(it.type_is_disabled, 0) = 0
              AND it.type_sort_number IS NOT NULL
              AND inv.invoice_create_date BETWEEN ? AND ?";

$paramTypes = 'ss';
$params = [$dateFromValue, $dateToValue];

if ($customerId !== null) {
    $dataSql .= " AND inv.invoice_customer_id = ?";
    $paramTypes .= 'i';
    $params[] = $customerId;
}

if ($supplierId !== null) {
    $dataSql .= " AND inv.invoice_supplier_id = ?";
    $paramTypes .= 'i';
    $params[] = $supplierId;
}

$dataSql .= "
            GROUP BY 
                inv.invoice_customer_id,
                cust.customer_name,
                inv.invoice_supplier_id,
                sup.supplier_name,
                inv.invoice_type_id";

$stmt = $conn->prepare($dataSql);

if (!$stmt) {
    echo json_encode(['error' => 'Failed to prepare data statement.'], JSON_UNESCAPED_UNICODE);
    $conn->close();
    exit();
}

$stmt->bind_param($paramTypes, ...$params);
$stmt->execute();
$result = $stmt->get_result();

while ($row = $result->fetch_assoc()) {
    $keyCustomer = $row['invoice_customer_id'] !== null ? 'C' . (int) $row['invoice_customer_id'] : 'C0';
    $keySupplier = $row['invoice_supplier_id'] !== null ? 'S' . (int) $row['invoice_supplier_id'] : 'S0';
    $rowKey = $keyCustomer . '|' . $keySupplier;

    if (!isset($rows[$rowKey])) {
        $rows[$rowKey] = [
            'customer_id' => $row['invoice_customer_id'] !== null ? (int) $row['invoice_customer_id'] : null,
            'customer_name' => $row['customer_name'] ?? null,
            'supplier_id' => $row['invoice_supplier_id'] !== null ? (int) $row['invoice_supplier_id'] : null,
            'supplier_name' => $row['supplier_name'] ?? null,
            'last_invoice_date_raw' => $row['latest_invoice_date'],
            'last_invoice_date' => $row['latest_invoice_date'] ? (new DateTime($row['latest_invoice_date']))->format('Y-m-d') : null,
            'stages' => [],
            'total_documents' => 0,
            'total_amount' => 0.0,
        ];
    } else {
        $existingRaw = $rows[$rowKey]['last_invoice_date_raw'];
        if ($row['latest_invoice_date'] && (!$existingRaw || $row['latest_invoice_date'] > $existingRaw)) {
            $rows[$rowKey]['last_invoice_date_raw'] = $row['latest_invoice_date'];
            $rows[$rowKey]['last_invoice_date'] = (new DateTime($row['latest_invoice_date']))->format('Y-m-d');
        }
    }

    $typeId = (int) $row['invoice_type_id'];
    $count = (int) $row['document_count'];
    $amount = (float) $row['document_total'];

    $rows[$rowKey]['stages'][$typeId] = [
        'document_count' => $count,
        'document_total' => $amount,
    ];

    $rows[$rowKey]['total_documents'] += $count;
    $rows[$rowKey]['total_amount'] += $amount;

    $totalDocuments += $count;
    $totalAmount += $amount;
}

$stmt->close();

$rowList = array_values($rows);

usort($rowList, function (array $a, array $b) {
    $dateA = $a['last_invoice_date_raw'] ?? '';
    $dateB = $b['last_invoice_date_raw'] ?? '';

    if ($dateA === $dateB) {
        $nameA = $a['customer_name'] ?? $a['supplier_name'] ?? '';
        $nameB = $b['customer_name'] ?? $b['supplier_name'] ?? '';
        return strcmp($nameA, $nameB);
    }

    return $dateA < $dateB ? 1 : -1;
});

foreach ($rowList as &$rowItem) {
    unset($rowItem['last_invoice_date_raw']);
    if (!$rowItem['customer_name']) {
        $rowItem['customer_name'] = 'بدون عميل';
    }
    if (!$rowItem['supplier_name']) {
        $rowItem['supplier_name'] = 'بدون مورد';
    }
}
unset($rowItem);

$customers = [];
$customerSql = "SELECT customer_id, customer_name FROM customer WHERE COALESCE(customer_is_deleted, 0) = 0 ORDER BY customer_name";
$customerResult = $conn->query($customerSql);
if ($customerResult) {
    while ($customerRow = $customerResult->fetch_assoc()) {
        $customers[] = [
            'customer_id' => (int) $customerRow['customer_id'],
            'customer_name' => $customerRow['customer_name'] ?? ('عميل #' . $customerRow['customer_id']),
        ];
    }
    $customerResult->free();
}

$suppliers = [];
$supplierSql = "SELECT supplier_id, supplier_name FROM supplier WHERE COALESCE(supplier_is_deleted, 0) = 0 ORDER BY supplier_name";
$supplierResult = $conn->query($supplierSql);
if ($supplierResult) {
    while ($supplierRow = $supplierResult->fetch_assoc()) {
        $suppliers[] = [
            'supplier_id' => (int) $supplierRow['supplier_id'],
            'supplier_name' => $supplierRow['supplier_name'] ?? ('مورد #' . $supplierRow['supplier_id']),
        ];
    }
    $supplierResult->free();
}

$conn->close();

$response = [
    'date_from' => $dateFrom->format('Y-m-d'),
    'date_to' => $dateTo->format('Y-m-d'),
    'filters' => [
        'customer_id' => $customerId,
        'supplier_id' => $supplierId,
    ],
    'stages' => $stages,
    'rows' => $rowList,
    'summary' => [
        'rows_count' => count($rowList),
        'total_documents' => $totalDocuments,
        'total_amount' => $totalAmount,
    ],
    'lookups' => [
        'customers' => $customers,
        'suppliers' => $suppliers,
    ],
];

echo json_encode($response, JSON_UNESCAPED_UNICODE);
?>