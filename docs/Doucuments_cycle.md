# Documents Life Cycle Module Documentation

## Overview

The Documents Life Cycle module tracks and manages document states/stages throughout their lifecycle in the system. It's built using a client-server architecture with PHP backend and JavaScript frontend.

## Table of Contents
1. [File Structure](#file-structure)
2. [Technical Architecture](#technical-architecture)
3. [Database Schema](#database-schema)
4. [Configuration](#configuration)
5. [Frontend Components](#frontend-components)
6. [Backend APIs](#backend-apis)
7. [User Guide](#user-guide)
8. [Developer Guide](#developer-guide)
9. [Troubleshooting](#troubleshooting)

## File Structure

```plaintext
/erpClientSide/
├── documents_life_cycle.html      # Main UI template
├── documents_life_cycle.js        # Frontend logic
├── documents_life_cycle_data.php  # Backend API for fetching lifecycle data
└── documents_life_cycle_settings.php  # Configuration and settings
```

## Technical Architecture

### Frontend (Client-side)
- **HTML**: `documents_life_cycle.html`
  - Responsive layout using flexbox
  - RTL support for Arabic
  - Uses CSS Grid for stage display
  - Modular components for filters and results

- **JavaScript**: `documents_life_cycle.js`
  - IIFE pattern for encapsulation
  - Event-driven architecture
  - Handles:
    - Filter management
    - AJAX calls to backend
    - DOM updates
    - Stage transitions
    - Document relationships

### Backend (Server-side)
- **Data Layer**: `documents_life_cycle_data.php`
  - Handles database queries
  - Implements filtering logic
  - Returns JSON responses

- **Configuration**: `documents_life_cycle_settings.php`
  - Defines stage types
  - Sets up document relationships
  - Configures workflow rules

## Database Schema

Key tables used by this module:

```sql
-- Document Stages
CREATE TABLE document_stages (
    stage_id INT PRIMARY KEY,
    stage_name VARCHAR(100),
    stage_type_id INT,
    -- other fields...
);

-- Document Relationships
CREATE TABLE document_relationships (
    source_doc_id INT,
    target_doc_id INT,
    relationship_type INT,
    -- other fields...
);

-- Stage Types
CREATE TABLE stage_types (
    type_id INT PRIMARY KEY,
    type_name VARCHAR(100),
    -- other fields...
);
```

## Configuration

### Stage Types Configuration
In `documents_life_cycle_settings.php`:

```php
$stageTypeIds = [
    'DRAFT' => 1,
    'REVIEW' => 2,
    'APPROVED' => 3,
    // Add new stages here
];
```

### Relationship Types
```php
$relationshipTypes = [
    'PARENT_CHILD' => 1,
    'REFERENCE' => 2,
    // Add new relationships here
];
```

## Frontend Components

### Filter Panel
- Date range picker
- Document type selector
- Stage type filter
- Search by document number

### Results Grid
- Displays documents in stage-based columns
- Shows relationships between documents
- Supports drag-drop for stage transitions

### JavaScript Events
Key event listeners in `documents_life_cycle.js`:
```javascript
// Filter form submission
document.querySelector('#filterForm').addEventListener('submit', handleFilter);

// Stage transition
document.querySelectorAll('.stage-column').forEach(col => {
    col.addEventListener('drop', handleStageDrop);
});

// Document relationship handling
document.querySelectorAll('.doc-card').forEach(card => {
    card.addEventListener('click', showRelationships);
});
```

## Backend APIs

### Fetch Documents
```http
GET documents_life_cycle_data.php?
    date_from={date}&
    date_to={date}&
    doc_type={type}&
    stage_type={stage}
```

Response format:
```json
{
    "documents": [{
        "doc_id": "123",
        "doc_number": "INV-2025-001",
        "current_stage": "REVIEW",
        "relationships": [{
            "type": "PARENT",
            "related_doc_id": "456"
        }]
    }],
    "total_count": 150
}
```

## User Guide

### Basic Usage
1. Use the filter panel to narrow down documents
2. Documents are displayed in columns by stage
3. Click a document to see relationships
4. Drag documents between stages (if permissions allow)

### Advanced Features
- Use the search box for quick document lookup
- Export filtered results to Excel
- Bulk stage transitions for multiple documents

## Developer Guide

### Adding a New Stage Type

1. Add stage type in database:
```sql
INSERT INTO stage_types (type_id, type_name) VALUES (4, 'NEW_STAGE');
```

2. Update settings file:
```php
// In documents_life_cycle_settings.php
$stageTypeIds['NEW_STAGE'] = 4;
```

3. Add UI elements:
```html
<!-- In documents_life_cycle.html -->
<div class="stage-column" data-stage="NEW_STAGE">
    <h3>New Stage</h3>
    <div class="doc-container"></div>
</div>
```

### Adding New Document Relationships

1. Update relationship types:
```php
$relationshipTypes['NEW_RELATION'] = 3;
```

2. Modify the frontend handler:
```javascript
// In documents_life_cycle.js
function handleNewRelation(sourceDoc, targetDoc) {
    // Implementation
}
```

### Error Handling

Frontend errors are logged to console and displayed in UI:
```javascript
function handleError(error) {
    console.error('Lifecycle Error:', error);
    showUserMessage('error', 'Failed to process request');
}
```

Backend errors return JSON with error details:
```php
if ($error) {
    header('Content-Type: application/json');
    echo json_encode(['error' => $error->getMessage()]);
    exit;
}
```

## Troubleshooting

### Common Issues

1. **Documents Not Loading**
   - Check network tab for API errors
   - Verify date range filters
   - Check database connectivity

2. **Stage Transitions Failing**
   - Verify user permissions
   - Check browser console for JS errors
   - Validate stage transition rules in settings

3. **Relationship Display Issues**
   - Inspect network response format
   - Verify relationship data in database
   - Check JS relationship mapping logic

### Debug Mode

Enable debug mode in settings:
```php
// In documents_life_cycle_settings.php
define('DLC_DEBUG', true);
```

This will:
- Log detailed errors
- Show API response data
- Display stage transition details

### Performance Optimization

1. **Database Queries**
   - Index commonly filtered fields
   - Use pagination for large datasets
   - Cache frequently accessed data

2. **Frontend**
   - Implement virtual scrolling for large lists
   - Debounce filter inputs
   - Use document fragments for DOM updates

## Security Considerations

1. **Input Validation**
   - All user inputs are sanitized
   - SQL injection prevention
   - XSS protection

2. **Permission Checks**
   - Stage transition authorization
   - Document access control
   - Relationship modification rights

## Extending the Module

### Custom Stage Actions
Add new stage-specific actions:
```javascript
// In documents_life_cycle.js
function addCustomStageAction(stageId, action) {
    stageActions[stageId] = stageActions[stageId] || [];
    stageActions[stageId].push(action);
}
```

### Custom Document Types
Define new document types with specific behaviors:
```php
// In documents_life_cycle_settings.php
$documentTypes['CUSTOM_DOC'] = [
    'stages' => ['DRAFT', 'REVIEW'],
    'actions' => ['approve', 'reject'],
    'relationships' => ['PARENT_CHILD']
];
```