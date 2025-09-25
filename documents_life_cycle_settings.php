<?php
if (!defined('DOCUMENTS_LIFE_CYCLE_SETTINGS_ACCESS')) {
    if (PHP_SAPI !== 'cli') {
        header('Content-Type: text/plain; charset=utf-8');
    }
    echo "This file only defines the life-cycle configuration array.";
    return [];
}

return [
    // Provide the invoice type IDs you want to show, in the desired order.
    // Leave empty to let the system pick the first types ordered by type_sort_number.
    // , 49, 32, 33,39
    'stage_type_ids' => [6, 45, 43, 44],

    // Optional: override the column labels per type id. Example: 5 => 'Purchase Order'.
    'stage_labels' => [],

    // Optional: restrict invoice relations to specific relation_type_ids. Leave empty for all.
    'relation_type_ids' => [],

    // When no explicit stage ids are provided, this controls how many stages are included by default.
    'max_auto_stage_count' => 4,
];
