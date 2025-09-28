<?php
if (!defined('DOCUMENTS_LIFE_CYCLE_SETTINGS_ACCESS')) {
    if (PHP_SAPI !== 'cli') {
        header('Content-Type: text/plain; charset=utf-8');
    }
    echo "This file only defines the life-cycle configuration array.";
    return [];
}

return array (
  'active_cycle_id' => 'wecare2',
  'cycles' => 
  array (
    'wecare2' => 
    array (
      'id' => 'wecare2',
      'name' => 'WeCare2',
      'stage_type_ids' => 
      array (
        0 => 43,
        1 => 34,
        2 => 44,
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
        0 => 45,
        1 => 31,
      ),
      'stage_labels' => 
      array (
      ),
      'max_auto_stage_count' => 2,
    ),
  ),
);
