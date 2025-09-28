<?php
if (!defined('DOCUMENTS_LIFE_CYCLE_SETTINGS_ACCESS')) {
    if (PHP_SAPI !== 'cli') {
        header('Content-Type: text/plain; charset=utf-8');
    }
    echo "This file only defines the life-cycle configuration array.";
    return [];
}

return array (
  'active_cycle_id' => 'default',
  'cycles' => 
  array (
    'default' => 
    array (
      'id' => 'default',
      'name' => 'Default Cycle',
      'stage_type_ids' => 
      array (
        0 => 45,
        1 => 43,
        2 => 44,
        3 => 32,
      ),
      'stage_labels' => 
      array (
      ),
      'max_auto_stage_count' => 3,
    ),
    'wecare1' => 
    array (
      'id' => 'wecare1',
      'name' => 'WeCare1',
      'stage_type_ids' => 
      array (
        0 => 14,
        1 => 28,
        2 => 2,
        3 => 45,
        4 => 4,
        5 => 49,
        6 => 34,
        7 => 44,
      ),
      'stage_labels' => 
      array (
      ),
      'max_auto_stage_count' => 7,
    ),
    'wecare2' => 
    array (
      'id' => 'wecare2',
      'name' => 'WeCare2',
      'stage_type_ids' => 
      array (
        0 => 15,
        1 => 32,
        2 => 36,
      ),
      'stage_labels' => 
      array (
      ),
      'max_auto_stage_count' => 4,
    ),
    'starfoods' => 
    array (
      'id' => 'starfoods',
      'name' => 'starfoods',
      'stage_type_ids' => 
      array (
        0 => 43,
        1 => 6,
        2 => 34,
      ),
      'stage_labels' => 
      array (
      ),
      'max_auto_stage_count' => 3,
    ),
  ),
);
