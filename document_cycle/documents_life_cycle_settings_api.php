<?php
header('Content-Type: application/json; charset=utf-8');

$settingsPath = __DIR__ . '/documents_life_cycle_settings.php';

$servername = "localhost";
$username = "root";
$password = "";
$dbname = "db_pos";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Connection failed: ' . $conn->connect_error], JSON_UNESCAPED_UNICODE);
    exit();
}

$conn->set_charset('utf8mb4');

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $config = loadRawLifecycleSettings($settingsPath);

    if ($method === 'GET') {
        $response = [
            'cycles' => prepareCyclesResponse($config['cycles'] ?? []),
            'active_cycle_id' => $config['active_cycle_id'] ?? null,
            'invoice_types' => fetchInvoiceTypes($conn),
        ];

        echo json_encode($response, JSON_UNESCAPED_UNICODE);
        return;
    }

    $payload = json_decode(file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        throw new RuntimeException('Invalid request payload.');
    }

    $cycles = $config['cycles'] ?? [];
    $activeId = $config['active_cycle_id'] ?? null;
    $action = $payload['action'] ?? '';
    $responseData = [];

    switch ($action) {
        case 'save':
            [$cycles, $activeId, $savedCycle] = handleSaveCycle($cycles, $activeId, $payload['cycle'] ?? []);
            $responseData['cycle'] = $savedCycle;
            break;
        case 'delete':
            [$cycles, $activeId] = handleDeleteCycle($cycles, $activeId, $payload['cycle_id'] ?? '');
            break;
        case 'set_active':
            $cycleId = isset($payload['cycle_id']) ? trim((string) $payload['cycle_id']) : '';
            if ($cycleId === '' || !isset($cycles[$cycleId])) {
                throw new RuntimeException('Selected cycle does not exist.');
            }
            $activeId = $cycleId;
            break;
        default:
            throw new RuntimeException('Unsupported action.');
    }

    $config['cycles'] = $cycles;
    $config['active_cycle_id'] = $activeId;
    writeLifecycleSettings($settingsPath, $config);

    $response = array_merge([
        'cycles' => prepareCyclesResponse($cycles),
        'active_cycle_id' => $activeId,
    ], $responseData);

    echo json_encode($response, JSON_UNESCAPED_UNICODE);
} catch (Throwable $throwable) {
    http_response_code(400);
    echo json_encode(['error' => $throwable->getMessage()], JSON_UNESCAPED_UNICODE);
} finally {
    $conn->close();
}

function loadRawLifecycleSettings(string $settingsPath): array
{
    $defaults = [
        'active_cycle_id' => 'default',
        'cycles' => [
            'default' => [
                'id' => 'default',
                'name' => 'Default Cycle',
                'stage_type_ids' => [],
                'stage_labels' => [],
                'max_auto_stage_count' => 4,
            ],
        ],
    ];

    if (!is_file($settingsPath)) {
        return $defaults;
    }

    if (!defined('DOCUMENTS_LIFE_CYCLE_SETTINGS_ACCESS')) {
        define('DOCUMENTS_LIFE_CYCLE_SETTINGS_ACCESS', true);
    }

    $data = include $settingsPath;
    if (!is_array($data)) {
        return $defaults;
    }

    if (!isset($data['cycles']) || !is_array($data['cycles'])) {
        $cycleSettings = array_merge($defaults['cycles']['default'], $data);
        $data = [
            'active_cycle_id' => 'default',
            'cycles' => [
                'default' => $cycleSettings,
            ],
        ];
    }

    if (empty($data['cycles'])) {
        $data['cycles'] = $defaults['cycles'];
    }

    if (empty($data['active_cycle_id']) || !isset($data['cycles'][$data['active_cycle_id']])) {
        $data['active_cycle_id'] = array_key_first($data['cycles']);
    }

    foreach ($data['cycles'] as $key => &$cycle) {
        if (!is_array($cycle)) {
            $cycle = $defaults['cycles']['default'];
        }

        $cycleId = isset($cycle['id']) ? trim((string) $cycle['id']) : '';
        if ($cycleId === '') {
            $cycleId = is_string($key) && trim($key) !== '' ? trim($key) : uniqid('cycle_', true);
        }

        $cycle['id'] = $cycleId;
        $cycle['name'] = isset($cycle['name']) && $cycle['name'] !== '' ? (string) $cycle['name'] : $cycleId;
        $cycle['stage_type_ids'] = normalizeIdList($cycle['stage_type_ids'] ?? []);

        $cycle['stage_labels'] = normalizeLabelMap($cycle['stage_labels'] ?? []);
        $cycle['max_auto_stage_count'] = isset($cycle['max_auto_stage_count']) ? max(1, (int) $cycle['max_auto_stage_count']) : 4;
    }
    unset($cycle);

    return $data;
}

function writeLifecycleSettings(string $settingsPath, array $config): void
{
    $header = "<?php\nif (!defined('DOCUMENTS_LIFE_CYCLE_SETTINGS_ACCESS')) {\n    if (PHP_SAPI !== 'cli') {\n        header('Content-Type: text/plain; charset=utf-8');\n    }\n    echo \"This file only defines the life-cycle configuration array.\";\n    return [];\n}\n\nreturn ";
    $export = var_export($config, true);
    $content = $header . $export . ";\n";
    file_put_contents($settingsPath, $content, LOCK_EX);
}

function prepareCyclesResponse(array $cycles): array
{
    $response = [];
    foreach ($cycles as $cycle) {
        if (!is_array($cycle)) {
            continue;
        }
        $response[] = [
            'id' => $cycle['id'] ?? '',
            'name' => $cycle['name'] ?? '',
            'stage_type_ids' => array_values($cycle['stage_type_ids'] ?? []),

            'stage_labels' => $cycle['stage_labels'] ?? [],
            'max_auto_stage_count' => $cycle['max_auto_stage_count'] ?? 4,
        ];
    }
    return $response;
}

function handleSaveCycle(array $cycles, ?string $activeId, array $input): array
{
    $name = isset($input['name']) ? trim((string) $input['name']) : '';
    if ($name === '') {
        throw new RuntimeException('Cycle name is required.');
    }

    $stageTypeIds = normalizeOrderedIdList($input['stage_type_ids'] ?? []);
    if (!$stageTypeIds) {
        throw new RuntimeException('At least one stage is required.');
    }

    $stageLabels = normalizeLabelMap($input['stage_labels'] ?? []);

    $maxStageCount = isset($input['max_auto_stage_count']) ? max(1, (int) $input['max_auto_stage_count']) : 4;

    $existingId = isset($input['id']) ? trim((string) $input['id']) : '';
    $cycleId = $existingId;
    if ($cycleId === '' || !isset($cycles[$cycleId])) {
        $candidate = $existingId !== '' ? $existingId : $name;
        $cycleId = generateCycleId($candidate);
        $suffix = 1;
        while (isset($cycles[$cycleId])) {
            $cycleId = generateCycleId($candidate . '_' . $suffix);
            $suffix += 1;
        }
    }

    $cycles[$cycleId] = [
        'id' => $cycleId,
        'name' => $name,
        'stage_type_ids' => $stageTypeIds,

        'stage_labels' => $stageLabels,
        'max_auto_stage_count' => $maxStageCount,
    ];

    if ($activeId === null) {
        $activeId = $cycleId;
    }

    return [$cycles, $activeId, $cycles[$cycleId]];
}

function handleDeleteCycle(array $cycles, ?string $activeId, string $cycleId): array
{
    $cycleId = trim($cycleId);
    if ($cycleId === '' || !isset($cycles[$cycleId])) {
        throw new RuntimeException('Cycle not found.');
    }

    if (count($cycles) === 1) {
        throw new RuntimeException('At least one cycle must remain.');
    }

    unset($cycles[$cycleId]);

    if ($activeId === $cycleId) {
        $activeId = array_key_first($cycles);
    }

    return [$cycles, $activeId];
}

function normalizeIdList($value): array
{
    $result = [];
    foreach ((array) $value as $item) {
        $id = (int) $item;
        if ($id > 0 && !isset($result[$id])) {
            $result[$id] = $id;
        }
    }
    return array_values($result);
}

function normalizeOrderedIdList($value): array
{
    $result = [];
    foreach ((array) $value as $item) {
        $id = (int) $item;
        if ($id > 0 && !in_array($id, $result, true)) {
            $result[] = $id;
        }
    }
    return $result;
}

function normalizeLabelMap($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $result = [];
    foreach ($value as $key => $label) {
        $id = (int) $key;
        if ($id > 0 && (is_string($label) || is_numeric($label))) {
            $result[$id] = (string) $label;
        }
    }
    return $result;
}

function generateCycleId(string $seed): string
{
    $seed = strtolower($seed);
    $seed = preg_replace('/[^a-z0-9]+/', '_', $seed);
    $seed = trim($seed, '_');
    if ($seed === '') {
        $seed = 'cycle';
    }
    return $seed;
}

function fetchInvoiceTypes(mysqli $conn): array
{
    $sql = "SELECT type_id, type_name FROM invoice_type ORDER BY type_id";
    $result = $conn->query($sql);

    if ($result === false) {
        throw new RuntimeException('Unable to load invoice types.');
    }

    $types = [];
    while ($row = $result->fetch_assoc()) {
        $types[] = [
            'id' => (int) $row['type_id'],
            'name' => isset($row['type_name']) ? (string) $row['type_name'] : ('Type ' . (int) $row['type_id']),
        ];
    }
    $result->free();

    return $types;
}







