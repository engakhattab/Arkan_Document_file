<?php
header('Content-Type: application/json; charset=utf-8');

$servername = "localhost";
$username = "root";
$password = "";
$dbname = "db_pos";

$settings = loadLifecycleSettings(__DIR__ . '/documents_life_cycle_settings.php');

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    echo json_encode(['error' => 'Connection failed: ' . $conn->connect_error], JSON_UNESCAPED_UNICODE);
    exit();
}

$conn->set_charset('utf8mb4');

$response = [];

try {
    $dateRange = parseDateRange($_GET['date_from'] ?? '', $_GET['date_to'] ?? '');

    $customerId = parseOptionalInt($_GET['customer_id'] ?? null);
    $supplierId = parseOptionalInt($_GET['supplier_id'] ?? null);

    $stageTypeIds = parseIdList($_GET['stage_type_ids'] ?? '');
    if (!$stageTypeIds && !empty($settings['stage_type_ids'])) {
        $stageTypeIds = array_values(array_filter(array_map('intval', (array) $settings['stage_type_ids']), static function ($value) {
            return $value > 0;
        }));
    }

    $relationTypeIds = parseIdList($_GET['relation_type_ids'] ?? '');
    if (!$relationTypeIds && !empty($settings['relation_type_ids'])) {
        $relationTypeIds = array_values(array_filter(array_map('intval', (array) $settings['relation_type_ids']), static function ($value) {
            return $value > 0;
        }));
    }

    $stageLimit = isset($settings['max_auto_stage_count']) ? max(1, (int) $settings['max_auto_stage_count']) : 4;

    $stageDefinitions = loadStageDefinitions($conn, $stageTypeIds, $stageLimit, $settings['stage_labels'] ?? []);

    if (!$stageDefinitions) {
        throw new RuntimeException('No active invoice types found for the life cycle table.');
    }

    $resolvedStageTypeIds = array_map(static function (array $stage) {
        return (int) $stage['type_id'];
    }, $stageDefinitions);

    $primaryData = fetchPrimaryInvoices(
        $conn,
        $resolvedStageTypeIds,
        $dateRange['from_datetime'],
        $dateRange['to_datetime'],
        $customerId,
        $supplierId
    );

    $invoices = $primaryData['invoices'];
    $primaryInvoiceIds = $primaryData['invoice_ids'];

    $relations = [];
    if (!empty($primaryInvoiceIds)) {
        $relations = fetchRelations($conn, $resolvedStageTypeIds, $relationTypeIds, $primaryInvoiceIds);

        if ($relations) {
            $relationInvoiceIds = [];
            foreach ($relations as $relationRow) {
                $relationInvoiceIds[$relationRow['source_id']] = true;
                $relationInvoiceIds[$relationRow['target_id']] = true;
            }

            $missingInvoiceIds = array_diff(array_keys($relationInvoiceIds), array_keys($invoices));

            if ($missingInvoiceIds) {
                $additionalInvoices = fetchAdditionalInvoices($conn, $resolvedStageTypeIds, $missingInvoiceIds);
                if ($additionalInvoices) {
                    foreach ($additionalInvoices as $invoiceId => $invoiceRow) {
                        if (!isset($invoices[$invoiceId])) {
                            $invoices[$invoiceId] = $invoiceRow;
                        }
                    }
                }
            }
        }
    }

    $lifecycleData = buildLifecycleData($stageDefinitions, $invoices, $relations, $primaryInvoiceIds);

    $lookups = loadLifecycleLookups($conn);

    $response = [
        'date_from' => $dateRange['from_string'],
        'date_to' => $dateRange['to_string'],
        'filters' => [
            'customer_id' => $customerId,
            'supplier_id' => $supplierId,
        ],
        'stages' => $stageDefinitions,
        'customers' => $lifecycleData['customers'],
        'summary' => [
            'total_customers' => count($lifecycleData['customers']),
            'total_cycles' => $lifecycleData['total_cycles'],
            'primary_documents' => count($primaryInvoiceIds),
        ],
        'lookups' => $lookups,
    ];
} catch (Throwable $throwable) {
    $response = ['error' => $throwable->getMessage()];
}

echo json_encode($response, JSON_UNESCAPED_UNICODE);

$conn->close();

function loadLifecycleSettings(string $settingsPath): array
{
    $defaults = [
        'stage_type_ids' => [],
        'stage_labels' => [],
        'relation_type_ids' => [],
        'max_auto_stage_count' => 4,
    ];

    if (is_file($settingsPath)) {
        if (!defined('DOCUMENTS_LIFE_CYCLE_SETTINGS_ACCESS')) {
            define('DOCUMENTS_LIFE_CYCLE_SETTINGS_ACCESS', true);
        }

        $data = include $settingsPath;
        if (is_array($data)) {
            return array_merge($defaults, $data);
        }
    }

    return $defaults;
}

function parseIdList($value): array
{
    if (is_array($value)) {
        $value = implode(',', $value);
    }

    if (!is_string($value) || $value === '') {
        return [];
    }

    $parts = preg_split('/[,\s]+/', $value, -1, PREG_SPLIT_NO_EMPTY);
    $ids = [];

    foreach ($parts as $part) {
        $id = (int) $part;
        if ($id > 0) {
            $ids[$id] = $id;
        }
    }

    return array_values($ids);
}

function parseOptionalInt($value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }

    $intValue = (int) $value;
    return $intValue > 0 ? $intValue : null;
}

function parseDateRange(?string $fromInput, ?string $toInput): array
{
    $defaultFrom = new DateTime('first day of this month 00:00:00');
    $defaultTo = new DateTime('today 23:59:59');

    $from = clone $defaultFrom;
    $to = clone $defaultTo;

    if ($fromInput) {
        $candidate = DateTime::createFromFormat('Y-m-d', $fromInput);
        if ($candidate instanceof DateTime) {
            $candidate->setTime(0, 0, 0);
            $from = $candidate;
        }
    }

    if ($toInput) {
        $candidate = DateTime::createFromFormat('Y-m-d', $toInput);
        if ($candidate instanceof DateTime) {
            $candidate->setTime(23, 59, 59);
            $to = $candidate;
        }
    }

    if ($from > $to) {
        [$from, $to] = [$to, $from];
        $from->setTime(0, 0, 0);
        $to->setTime(23, 59, 59);
    }

    return [
        'from' => $from,
        'to' => $to,
        'from_string' => $from->format('Y-m-d'),
        'to_string' => $to->format('Y-m-d'),
        'from_datetime' => $from->format('Y-m-d H:i:s'),
        'to_datetime' => $to->format('Y-m-d H:i:s'),
    ];
}

function loadStageDefinitions(mysqli $conn, array $requestedStageIds, int $stageLimit, array $customLabels): array
{
    $definitions = [];

    if ($requestedStageIds) {
        $stageIds = array_values(array_filter(array_unique(array_map('intval', $requestedStageIds)), static function ($value) {
            return $value > 0;
        }));

        if (!$stageIds) {
            return [];
        }

        $idList = implode(',', $stageIds);
        $sql = "SELECT type_id, type_name, type_hex_color, type_operation, type_sort_number
                FROM invoice_type
                WHERE type_id IN ($idList)
                  AND COALESCE(type_is_deleted, 0) = 0
                  AND COALESCE(type_is_disabled, 0) = 0
                ORDER BY FIELD(type_id, $idList)";
    } else {
        $limit = max(1, $stageLimit);
        $sql = "SELECT type_id, type_name, type_hex_color, type_operation, type_sort_number
                FROM invoice_type
                WHERE COALESCE(type_is_deleted, 0) = 0
                  AND COALESCE(type_is_disabled, 0) = 0
                  AND type_sort_number IS NOT NULL
                ORDER BY type_sort_number ASC, type_id ASC
                LIMIT {$limit}";
    }

    $result = $conn->query($sql);

    if ($result === false) {
        throw new RuntimeException('Failed to load invoice types.');
    }

    while ($row = $result->fetch_assoc()) {
        $typeId = (int) $row['type_id'];
        $definitions[] = [
            'type_id' => $typeId,
            'type_name' => $row['type_name'] ?? '',
            'column_label' => $customLabels[$typeId] ?? ($row['type_name'] ?? ''),
            'type_hex_color' => $row['type_hex_color'] ?? null,
            'type_operation' => $row['type_operation'] ?? null,
            'type_sort_number' => isset($row['type_sort_number']) ? (int) $row['type_sort_number'] : null,
        ];
    }

    $result->free();

    return $definitions;
}

function fetchPrimaryInvoices(
    mysqli $conn,
    array $stageTypeIds,
    string $fromDateTime,
    string $toDateTime,
    ?int $customerId,
    ?int $supplierId
): array {
    if (!$stageTypeIds) {
        return ['invoices' => [], 'invoice_ids' => []];
    }

    $stageList = implode(',', array_map('intval', $stageTypeIds));

    $sql = "SELECT
                inv.invoice_id,
                inv.invoice_number,
                inv.invoice_type_id,
                inv.invoice_customer_id,
                inv.invoice_supplier_id,
                inv.invoice_create_date,
                cust.customer_name,
                sup.supplier_name
            FROM invoice AS inv
            LEFT JOIN customer AS cust ON inv.invoice_customer_id = cust.customer_id
            LEFT JOIN supplier AS sup ON inv.invoice_supplier_id = sup.supplier_id
            WHERE COALESCE(inv.invoice_is_canceled, 0) <> 1
              AND inv.invoice_type_id IN ({$stageList})
              AND inv.invoice_create_date BETWEEN ? AND ?";

    $types = 'ss';
    $params = [$fromDateTime, $toDateTime];

    if ($customerId !== null) {
        $sql .= " AND inv.invoice_customer_id = ?";
        $types .= 'i';
        $params[] = $customerId;
    }

    if ($supplierId !== null) {
        $sql .= " AND inv.invoice_supplier_id = ?";
        $types .= 'i';
        $params[] = $supplierId;
    }

    $sql .= ' ORDER BY inv.invoice_create_date DESC, inv.invoice_id DESC';

    $stmt = $conn->prepare($sql);

    if (!$stmt) {
        throw new RuntimeException('Failed to prepare invoice query.');
    }

    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    $invoices = [];
    $invoiceIds = [];

    while ($row = $result->fetch_assoc()) {
        $invoiceId = (int) $row['invoice_id'];
        $invoices[$invoiceId] = [
            'invoice_id' => $invoiceId,
            'invoice_number' => $row['invoice_number'] !== null ? (string) $row['invoice_number'] : null,
            'invoice_type_id' => (int) $row['invoice_type_id'],
            'customer_id' => $row['invoice_customer_id'] !== null ? (int) $row['invoice_customer_id'] : null,
            'customer_name' => $row['customer_name'] ?? null,
            'supplier_id' => $row['invoice_supplier_id'] !== null ? (int) $row['invoice_supplier_id'] : null,
            'supplier_name' => $row['supplier_name'] ?? null,
            'invoice_create_date' => $row['invoice_create_date'],
            'is_primary' => true,
        ];
        $invoiceIds[] = $invoiceId;
    }

    $stmt->close();

    return ['invoices' => $invoices, 'invoice_ids' => $invoiceIds];
}

function fetchAdditionalInvoices(mysqli $conn, array $stageTypeIds, array $invoiceIds): array
{
    $invoiceIds = array_values(array_filter(array_map('intval', $invoiceIds), static function ($value) {
        return $value > 0;
    }));

    if (!$invoiceIds) {
        return [];
    }

    $stageList = implode(',', array_map('intval', $stageTypeIds));
    $invoiceList = implode(',', $invoiceIds);

    $sql = "SELECT
                inv.invoice_id,
                inv.invoice_number,
                inv.invoice_type_id,
                inv.invoice_customer_id,
                inv.invoice_supplier_id,
                inv.invoice_create_date,
                cust.customer_name,
                sup.supplier_name
            FROM invoice AS inv
            LEFT JOIN customer AS cust ON inv.invoice_customer_id = cust.customer_id
            LEFT JOIN supplier AS sup ON inv.invoice_supplier_id = sup.supplier_id
            WHERE inv.invoice_id IN ({$invoiceList})
              AND inv.invoice_type_id IN ({$stageList})";

    $result = $conn->query($sql);

    if ($result === false) {
        throw new RuntimeException('Failed to load related invoices.');
    }

    $invoices = [];

    while ($row = $result->fetch_assoc()) {
        $invoiceId = (int) $row['invoice_id'];
        $invoices[$invoiceId] = [
            'invoice_id' => $invoiceId,
            'invoice_number' => $row['invoice_number'] !== null ? (string) $row['invoice_number'] : null,
            'invoice_type_id' => (int) $row['invoice_type_id'],
            'customer_id' => $row['invoice_customer_id'] !== null ? (int) $row['invoice_customer_id'] : null,
            'customer_name' => $row['customer_name'] ?? null,
            'supplier_id' => $row['invoice_supplier_id'] !== null ? (int) $row['invoice_supplier_id'] : null,
            'supplier_name' => $row['supplier_name'] ?? null,
            'invoice_create_date' => $row['invoice_create_date'],
            'is_primary' => false,
        ];
    }

    $result->free();

    return $invoices;
}

function fetchRelations(
    mysqli $conn,
    array $stageTypeIds,
    array $relationTypeIds,
    array $focusInvoiceIds
): array {
    $focusInvoiceIds = array_values(array_filter(array_map('intval', $focusInvoiceIds), static function ($value) {
        return $value > 0;
    }));

    if (!$focusInvoiceIds || !$stageTypeIds) {
        return [];
    }

    $stageList = implode(',', array_map('intval', $stageTypeIds));
    $focusList = implode(',', $focusInvoiceIds);

    $sql = "SELECT
                ir.relation_source_id,
                ir.relation_target_id,
                ir.relation_type_id
            FROM invoice_relation AS ir
            INNER JOIN invoice AS src ON src.invoice_id = ir.relation_source_id
            INNER JOIN invoice AS tgt ON tgt.invoice_id = ir.relation_target_id
            WHERE src.invoice_type_id IN ({$stageList})
              AND tgt.invoice_type_id IN ({$stageList})
              AND (ir.relation_source_id IN ({$focusList}) OR ir.relation_target_id IN ({$focusList}))";

    if ($relationTypeIds) {
        $relationList = implode(',', array_map('intval', $relationTypeIds));
        $sql .= " AND ir.relation_type_id IN ({$relationList})";
    }

    $result = $conn->query($sql);

    if ($result === false) {
        throw new RuntimeException('Failed to load invoice relations.');
    }

    $relations = [];

    while ($row = $result->fetch_assoc()) {
        $relations[] = [
            'source_id' => (int) $row['relation_source_id'],
            'target_id' => (int) $row['relation_target_id'],
            'relation_type_id' => isset($row['relation_type_id']) ? (int) $row['relation_type_id'] : null,
        ];
    }

    $result->free();

    return $relations;
}

function buildLifecycleData(
    array $stageDefinitions,
    array $invoices,
    array $relations,
    array $primaryInvoiceIds
): array {
    $stageCount = count($stageDefinitions);

    if ($stageCount === 0) {
        return ['customers' => [], 'total_cycles' => 0];
    }

    $stageTypeIds = array_map(static function (array $stage) {
        return (int) $stage['type_id'];
    }, $stageDefinitions);

    $stageIndexByType = [];
    foreach ($stageTypeIds as $index => $typeId) {
        $stageIndexByType[$typeId] = $index;
    }

    $forwardMap = [];
    $backwardMap = [];

    foreach ($relations as $relation) {
        $sourceId = $relation['source_id'];
        $targetId = $relation['target_id'];

        if (!isset($invoices[$sourceId], $invoices[$targetId])) {
            continue;
        }

        $sourceStageIndex = $stageIndexByType[$invoices[$sourceId]['invoice_type_id']] ?? null;
        $targetStageIndex = $stageIndexByType[$invoices[$targetId]['invoice_type_id']] ?? null;

        if ($sourceStageIndex === null || $targetStageIndex === null) {
            continue;
        }

        if ($targetStageIndex !== $sourceStageIndex + 1) {
            continue;
        }

        if (!isset($forwardMap[$sourceId])) {
            $forwardMap[$sourceId] = [];
        }
        $forwardMap[$sourceId][$targetId] = true;

        if (!isset($backwardMap[$targetId])) {
            $backwardMap[$targetId] = [];
        }
        $backwardMap[$targetId][$sourceId] = true;
    }

    $roots = [];

    foreach ($invoices as $invoiceId => $invoice) {
        $stageIndex = $stageIndexByType[$invoice['invoice_type_id']] ?? null;
        if ($stageIndex === null) {
            continue;
        }

        $hasParent = false;
        if ($stageIndex > 0 && isset($backwardMap[$invoiceId])) {
            foreach (array_keys($backwardMap[$invoiceId]) as $parentId) {
                if (!isset($invoices[$parentId])) {
                    continue;
                }
                $parentStage = $stageIndexByType[$invoices[$parentId]['invoice_type_id']] ?? null;
                if ($parentStage === $stageIndex - 1) {
                    $hasParent = true;
                    break;
                }
            }
        }

        if (!$hasParent) {
            $roots[] = [
                'invoice_id' => $invoiceId,
                'stage_index' => $stageIndex,
            ];
        }
    }

    if (!$roots && $invoices) {
        foreach ($invoices as $invoiceId => $invoice) {
            $stageIndex = $stageIndexByType[$invoice['invoice_type_id']] ?? null;
            if ($stageIndex === null) {
                continue;
            }
            $roots[] = [
                'invoice_id' => $invoiceId,
                'stage_index' => $stageIndex,
            ];
        }
    }

    $paths = [];
    $templatePath = array_fill(0, $stageCount, null);

    foreach ($roots as $root) {
        $path = $templatePath;
        $visited = [];
        expandLifecyclePath(
            $root['invoice_id'],
            $root['stage_index'],
            $path,
            $visited,
            $paths,
            $forwardMap,
            $stageIndexByType,
            $invoices,
            $stageCount
        );
    }

    if (!$paths && $invoices) {
        foreach ($invoices as $invoiceId => $invoice) {
            $stageIndex = $stageIndexByType[$invoice['invoice_type_id']] ?? null;
            if ($stageIndex === null) {
                continue;
            }
            $path = $templatePath;
            $path[$stageIndex] = $invoiceId;
            $paths[] = $path;
        }
    }

    $uniquePaths = [];
    foreach ($paths as $path) {
        $key = implode('|', array_map(static function ($invoiceId) {
            return $invoiceId ? (string) $invoiceId : '0';
        }, $path));
        $uniquePaths[$key] = $path;
    }

    $customers = [];
    $primarySet = array_fill_keys(array_map('intval', $primaryInvoiceIds), true);

    foreach ($uniquePaths as $pathKey => $path) {
        $documents = [];
        $cycleDates = [];
        $customerId = null;
        $customerName = null;

        foreach ($path as $stageIndex => $invoiceId) {
            $typeId = $stageTypeIds[$stageIndex];
            if ($invoiceId !== null && isset($invoices[$invoiceId])) {
                $invoiceData = $invoices[$invoiceId];
                if (!empty($invoiceData['invoice_create_date'])) {
                    $cycleDates[] = $invoiceData['invoice_create_date'];
                }

                if ($customerId === null && !empty($invoiceData['customer_id'])) {
                    $customerId = (int) $invoiceData['customer_id'];
                    $customerName = $invoiceData['customer_name'] ?: null;
                } elseif ($customerName === null && !empty($invoiceData['customer_name'])) {
                    $customerName = $invoiceData['customer_name'];
                }

                $prevId = $stageIndex > 0 ? ($path[$stageIndex - 1] ?? null) : null;
                $nextId = $stageIndex < count($path) - 1 ? ($path[$stageIndex + 1] ?? null) : null;

                $documents[] = [
                    'stage_index' => $stageIndex,
                    'stage_type_id' => $typeId,
                    'invoice_id' => (int) $invoiceId,
                    'invoice_number' => $invoiceData['invoice_number'],
                    'invoice_date' => $invoiceData['invoice_create_date'] ?? null,
                    'converted_from_invoice_id' => $prevId ? (int) $prevId : null,
                    'converted_from_invoice_number' => ($prevId && isset($invoices[$prevId])) ? $invoices[$prevId]['invoice_number'] : null,
                    'converted_to_invoice_id' => $nextId ? (int) $nextId : null,
                    'converted_to_invoice_number' => ($nextId && isset($invoices[$nextId])) ? $invoices[$nextId]['invoice_number'] : null,
                    'is_within_filters' => isset($primarySet[$invoiceId]),
                ];
            } else {
                $prevId = $stageIndex > 0 ? ($path[$stageIndex - 1] ?? null) : null;
                $nextId = $stageIndex < count($path) - 1 ? ($path[$stageIndex + 1] ?? null) : null;

                $documents[] = [
                    'stage_index' => $stageIndex,
                    'stage_type_id' => $typeId,
                    'invoice_id' => null,
                    'invoice_number' => null,
                    'invoice_date' => null,
                    'converted_from_invoice_id' => $prevId ? (int) $prevId : null,
                    'converted_from_invoice_number' => ($prevId && isset($invoices[$prevId])) ? $invoices[$prevId]['invoice_number'] : null,
                    'converted_to_invoice_id' => $nextId ? (int) $nextId : null,
                    'converted_to_invoice_number' => ($nextId && isset($invoices[$nextId])) ? $invoices[$nextId]['invoice_number'] : null,
                    'is_within_filters' => false,
                ];
            }
        }

        $latestDate = null;
        if ($cycleDates) {
            rsort($cycleDates);
            $latestDate = $cycleDates[0];
        }

        $customerKey = $customerId !== null ? 'C' . $customerId : 'C0';
        if (!isset($customers[$customerKey])) {
            $customers[$customerKey] = [
                'customer_id' => $customerId,
                'customer_name' => $customerName ?: 'Unknown customer',
                'cycles' => [],
                'total_documents' => 0,
            ];
        } elseif ($customers[$customerKey]['customer_name'] === 'Unknown customer' && $customerName) {
            $customers[$customerKey]['customer_name'] = $customerName;
        }

        $cycleDocumentCount = 0;
        foreach ($documents as $documentEntry) {
            if (!empty($documentEntry['invoice_id'])) {
                $cycleDocumentCount++;
            }
        }

        $customers[$customerKey]['cycles'][] = [
            'cycle_id' => $pathKey,
            'documents' => $documents,
            'documents_count' => $cycleDocumentCount,
            'latest_activity_at' => $latestDate,
        ];
        $customers[$customerKey]['total_documents'] += $cycleDocumentCount;
    }

    foreach ($customers as &$customerGroup) {
        usort($customerGroup['cycles'], static function ($a, $b) {
            $aDate = $a['latest_activity_at'] ?? '';
            $bDate = $b['latest_activity_at'] ?? '';
            if ($aDate === $bDate) {
                return strcmp($a['cycle_id'], $b['cycle_id']);
            }
            return $aDate < $bDate ? 1 : -1;
        });
        $customerGroup['cycles'] = array_values($customerGroup['cycles']);
        $customerGroup['row_count'] = count($customerGroup['cycles']);
        if (!isset($customerGroup['total_documents'])) {
            $totalDocs = 0;
            foreach ($customerGroup['cycles'] as $cycleInfo) {
                $totalDocs += $cycleInfo['documents_count'] ?? 0;
            }
            $customerGroup['total_documents'] = $totalDocs;
        }
    }
    unset($customerGroup);

    uasort($customers, static function ($a, $b) {
        $nameA = $a['customer_name'] ?? '';
        $nameB = $b['customer_name'] ?? '';
        if ($nameA === $nameB) {
            $idA = $a['customer_id'] ?? 0;
            $idB = $b['customer_id'] ?? 0;
            return $idA <=> $idB;
        }

        return strnatcasecmp($nameA, $nameB);
    });

    return [
        'customers' => array_values($customers),
        'total_cycles' => count($uniquePaths),
    ];
}

function expandLifecyclePath(
    int $invoiceId,
    int $stageIndex,
    array $path,
    array $visited,
    array &$paths,
    array $forwardMap,
    array $stageIndexByType,
    array $invoices,
    int $stageCount
): void {
    if (isset($visited[$invoiceId])) {
        return;
    }

    $visited[$invoiceId] = true;
    $path[$stageIndex] = $invoiceId;

    if ($stageIndex >= $stageCount - 1) {
        $paths[] = $path;
        return;
    }

    $nextCandidates = isset($forwardMap[$invoiceId]) ? array_keys($forwardMap[$invoiceId]) : [];
    $validCandidates = [];

    foreach ($nextCandidates as $candidateId) {
        if (!isset($invoices[$candidateId])) {
            continue;
        }
        $candidateStageIndex = $stageIndexByType[$invoices[$candidateId]['invoice_type_id']] ?? null;
        if ($candidateStageIndex === $stageIndex + 1) {
            $validCandidates[] = $candidateId;
        }
    }

    if (!$validCandidates) {
        $paths[] = $path;
        return;
    }

    foreach ($validCandidates as $candidateId) {
        expandLifecyclePath(
            $candidateId,
            $stageIndex + 1,
            $path,
            $visited,
            $paths,
            $forwardMap,
            $stageIndexByType,
            $invoices,
            $stageCount
        );
    }
}

function loadLifecycleLookups(mysqli $conn): array
{
    $customers = [];
    $customerSql = "SELECT customer_id, customer_name
                    FROM customer
                    WHERE COALESCE(customer_is_deleted, 0) = 0
                    ORDER BY customer_name";

    if ($result = $conn->query($customerSql)) {
        while ($row = $result->fetch_assoc()) {
            $customers[] = [
                'customer_id' => (int) $row['customer_id'],
                'customer_name' => $row['customer_name'] ?? ('Customer #' . $row['customer_id']),
            ];
        }
        $result->free();
    }

    $suppliers = [];
    $supplierSql = "SELECT supplier_id, supplier_name
                    FROM supplier
                    WHERE COALESCE(supplier_is_deleted, 0) = 0
                    ORDER BY supplier_name";

    if ($result = $conn->query($supplierSql)) {
        while ($row = $result->fetch_assoc()) {
            $suppliers[] = [
                'supplier_id' => (int) $row['supplier_id'],
                'supplier_name' => $row['supplier_name'] ?? ('Supplier #' . $row['supplier_id']),
            ];
        }
        $result->free();
    }

    return [
        'customers' => $customers,
        'suppliers' => $suppliers,
    ];
}




