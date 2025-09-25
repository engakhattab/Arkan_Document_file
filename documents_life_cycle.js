(function () {
    'use strict';

    const lifecycleSettings = window.lifecycleSettings || {};

    const configuredStageTypeIds = Array.isArray(lifecycleSettings.stageTypeIds)
        ? lifecycleSettings.stageTypeIds.filter(function (value) {
              return value !== null && value !== undefined && value !== '';
          }).map(String)
        : [];

    const configuredRelationTypeIds = Array.isArray(lifecycleSettings.relationTypeIds)
        ? lifecycleSettings.relationTypeIds.filter(function (value) {
              return value !== null && value !== undefined && value !== '';
          }).map(String)
        : [];

    const dom = {
        form: document.getElementById('filters-form'),
        dateFrom: document.getElementById('date-from'),
        dateTo: document.getElementById('date-to'),
        customerSelect: document.getElementById('customer-select'),
        supplierSelect: document.getElementById('supplier-select'),
        resetButton: document.getElementById('reset-filters'),
        quickRangeButtons: Array.from(document.querySelectorAll('.quick-range button')),
        summaryBar: document.getElementById('summary-bar'),
        tableHeadRow: document.getElementById('table-head-row'),
        tableBody: document.getElementById('table-body'),
        tableEmpty: document.getElementById('table-empty'),
        lastUpdated: document.getElementById('last-updated'),
    };

    const numberFormatter = new Intl.NumberFormat('en-US');
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    let currentStages = [];

    function init() {
        initializeDateInputs();
        attachEventListeners();
        fetchLifecycle();
    }

    function initializeDateInputs() {
        if (!dom.dateFrom || !dom.dateTo) {
            return;
        }
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        dom.dateFrom.value = formatDateInput(startOfMonth);
        dom.dateTo.value = formatDateInput(today);
    }

    function formatDateInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function attachEventListeners() {
        if (dom.form) {
            dom.form.addEventListener('submit', function (event) {
                event.preventDefault();
                fetchLifecycle();
            });
        }

        if (dom.resetButton) {
            dom.resetButton.addEventListener('click', function () {
                if (dom.customerSelect) {
                    dom.customerSelect.value = '';
                }
                if (dom.supplierSelect) {
                    dom.supplierSelect.value = '';
                }
                initializeDateInputs();
                fetchLifecycle();
            });
        }

        dom.quickRangeButtons.forEach(function (button) {
            button.addEventListener('click', function () {
                setQuickRange(button.dataset.range);
            });
        });
    }

    function setQuickRange(range) {
        if (!dom.dateFrom || !dom.dateTo) {
            return;
        }

        const today = new Date();
        let from = new Date(today);

        if (range === 'week') {
            const weekday = today.getDay();
            const diff = weekday === 0 ? 6 : weekday - 1;
            from.setDate(today.getDate() - diff);
        } else if (range === 'month') {
            from = new Date(today.getFullYear(), today.getMonth(), 1);
        } else if (range === 'today') {
            from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        }

        dom.dateFrom.value = formatDateInput(from);
        dom.dateTo.value = formatDateInput(today);
        fetchLifecycle();
    }

    function buildRequestParams() {
        const params = new URLSearchParams();

        if (dom.dateFrom && dom.dateFrom.value) {
            params.set('date_from', dom.dateFrom.value);
        }
        if (dom.dateTo && dom.dateTo.value) {
            params.set('date_to', dom.dateTo.value);
        }
        if (dom.customerSelect && dom.customerSelect.value) {
            params.set('customer_id', dom.customerSelect.value);
        }
        if (dom.supplierSelect && dom.supplierSelect.value) {
            params.set('supplier_id', dom.supplierSelect.value);
        }
        if (configuredStageTypeIds.length) {
            params.set('stage_type_ids', configuredStageTypeIds.join(','));
        }
        if (configuredRelationTypeIds.length) {
            params.set('relation_type_ids', configuredRelationTypeIds.join(','));
        }

        return params;
    }

    function setLoadingState() {
        if (dom.summaryBar) {
            dom.summaryBar.innerHTML = '';
        }
        if (dom.tableBody) {
            dom.tableBody.innerHTML = '';
        }
        if (dom.lastUpdated) {
            dom.lastUpdated.textContent = '';
        }
        showEmptyState('Loading document life cycles...');
    }

    function showEmptyState(message) {
        if (!dom.tableEmpty) {
            return;
        }
        dom.tableEmpty.hidden = false;
        dom.tableEmpty.textContent = message;
    }

    function hideEmptyState() {
        if (!dom.tableEmpty) {
            return;
        }
        dom.tableEmpty.hidden = true;
        dom.tableEmpty.textContent = '';
    }

    function setErrorState(message) {
        if (dom.summaryBar) {
            dom.summaryBar.innerHTML = '';
        }
        if (dom.tableBody) {
            dom.tableBody.innerHTML = '';
        }
        showEmptyState(message);
    }

    function fetchLifecycle() {
        if (!dom.dateFrom || !dom.dateTo) {
            return;
        }

        if (!dom.dateFrom.value || !dom.dateTo.value) {
            setErrorState('Please choose a valid date range.');
            return;
        }

        if (new Date(dom.dateFrom.value) > new Date(dom.dateTo.value)) {
            setErrorState('Start date must be before end date.');
            return;
        }

        const params = buildRequestParams();
        setLoadingState();

        fetch(`documents_life_cycle_data.php?${params.toString()}`)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(function (data) {
                if (data.error) {
                    throw new Error(data.error);
                }

                applyLookups(data.lookups || {});
                currentStages = Array.isArray(data.stages) ? data.stages : [];
                buildTableHeader(currentStages);
                renderSummary(data.summary || {});
                renderCustomers(Array.isArray(data.customers) ? data.customers : []);

                if (dom.lastUpdated) {
                    dom.lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleString();
                }
            })
            .catch(function (error) {
                console.error('Life cycle fetch error:', error);
                setErrorState('Unable to load the document life cycle. Please try again.');
            });
    }

    function applyLookups(lookups) {
        if (lookups.customers) {
            populateSelect(dom.customerSelect, lookups.customers, 'All customers', 'customer_id', 'customer_name');
        }
        if (lookups.suppliers) {
            populateSelect(dom.supplierSelect, lookups.suppliers, 'All suppliers', 'supplier_id', 'supplier_name');
        }
    }

    function populateSelect(selectElement, items, placeholder, valueKey, labelKey) {
        if (!selectElement) {
            return;
        }

        const previousValue = selectElement.value;
        selectElement.innerHTML = '';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = placeholder;
        selectElement.appendChild(defaultOption);

        items.forEach(function (item) {
            const option = document.createElement('option');
            option.value = String(item[valueKey]);
            option.textContent = item[labelKey] || `${valueKey} #${item[valueKey]}`;
            selectElement.appendChild(option);
        });

        if (previousValue && selectElement.querySelector(`option[value="${previousValue}"]`)) {
            selectElement.value = previousValue;
        }
    }

    function buildTableHeader(stages) {
        if (!dom.tableHeadRow) {
            return;
        }

        dom.tableHeadRow.innerHTML = '';

        if (!stages || !stages.length) {
            showEmptyState('Please configure the document stages to display.');
            return;
        }

        const customerTh = document.createElement('th');
        customerTh.className = 'customer-column';
        customerTh.textContent = 'Customer';
        dom.tableHeadRow.appendChild(customerTh);

        stages.forEach(function (stage, index) {
            const th = document.createElement('th');
            th.className = 'stage-column';
            if (stage.type_hex_color) {
                th.style.setProperty('--stage-color', stage.type_hex_color);
            }

            const title = document.createElement('span');
            title.className = 'stage-head-title';
            title.textContent = stage.column_label || stage.type_name || `Stage ${index + 1}`;
            th.appendChild(title);

            if (typeof stage.type_sort_number === 'number') {
                const meta = document.createElement('span');
                meta.className = 'stage-head-meta';
                meta.textContent = `Order ${stage.type_sort_number}`;
                th.appendChild(meta);
            }

            dom.tableHeadRow.appendChild(th);
        });
    }

    function renderSummary(summary) {
        if (!dom.summaryBar) {
            return;
        }

        dom.summaryBar.innerHTML = '';

        const chips = [
            { label: 'Customers', value: numberFormatter.format(summary.total_customers || 0) },
            { label: 'Document cycles', value: numberFormatter.format(summary.total_cycles || 0) },
            { label: 'Primary documents', value: numberFormatter.format(summary.primary_documents || 0) },
        ];

        chips.forEach(function (chipData) {
            const chip = document.createElement('div');
            chip.className = 'summary-chip';

            const label = document.createElement('span');
            label.textContent = chipData.label;

            const value = document.createElement('strong');
            value.textContent = chipData.value;

            chip.appendChild(label);
            chip.appendChild(value);
            dom.summaryBar.appendChild(chip);
        });
    }

    function renderCustomers(customers) {
        if (!dom.tableBody) {
            return;
        }

        dom.tableBody.innerHTML = '';

        if (!currentStages.length) {
            showEmptyState('Please configure the document stages to display.');
            return;
        }

        if (!Array.isArray(customers) || !customers.length) {
            showEmptyState('No document life cycles found for the selected filters.');
            return;
        }

        hideEmptyState();

        customers.forEach(function (customer) {
            const cycles = Array.isArray(customer.cycles) && customer.cycles.length ? customer.cycles : [createEmptyCycle()];
            const rowSpan = customer.row_count || cycles.length;

            cycles.forEach(function (cycle, index) {
                const tr = document.createElement('tr');

                if (index === 0) {
                    tr.appendChild(createCustomerCell(customer, rowSpan));
                }

                const documents = Array.isArray(cycle.documents) ? cycle.documents : [];
                for (let stageIndex = 0; stageIndex < currentStages.length; stageIndex += 1) {
                    const entry = documents[stageIndex] || null;
                    tr.appendChild(createDocumentCell(entry, currentStages[stageIndex]));
                }

                dom.tableBody.appendChild(tr);
            });
        });
    }

    function createEmptyCycle() {
        return { documents: [] };
    }

    function createCustomerCell(customer, rowSpan) {
        const td = document.createElement('td');
        td.className = 'customer-cell';
        if (rowSpan && rowSpan > 1) {
            td.rowSpan = rowSpan;
        }

        const name = document.createElement('div');
        name.className = 'customer-name';
        name.textContent = customer.customer_name || 'Unknown customer';
        td.appendChild(name);

        const meta = document.createElement('div');
        meta.className = 'customer-meta';
        const cycleCount = rowSpan || (Array.isArray(customer.cycles) ? customer.cycles.length : 0);
        meta.textContent = `${numberFormatter.format(cycleCount)} ${cycleCount === 1 ? 'cycle' : 'cycles'}`;
        td.appendChild(meta);

        return td;
    }

    function createDocumentCell(entry, stage) {
        const td = document.createElement('td');
        td.className = 'doc-cell';

        if (!entry || !entry.invoice_id) {
            td.classList.add('doc-cell--empty');
            td.appendChild(document.createTextNode('--'));
            return td;
        }

        td.dataset.invoiceId = String(entry.invoice_id);
        td.setAttribute('title', buildCellTooltip(entry, stage));

        const numberEl = document.createElement('div');
        numberEl.className = 'doc-number';
        numberEl.textContent = entry.invoice_number || `#${entry.invoice_id}`;
        td.appendChild(numberEl);

        const details = document.createElement('div');
        details.className = 'doc-details';

        if (entry.converted_from_invoice_number) {
            const fromEl = document.createElement('span');
            fromEl.className = 'doc-link doc-link--from';
            fromEl.textContent = `from ${entry.converted_from_invoice_number}`;
            details.appendChild(fromEl);
        }

        if (entry.converted_to_invoice_number) {
            const toEl = document.createElement('span');
            toEl.className = 'doc-link doc-link--to';
            toEl.textContent = `to ${entry.converted_to_invoice_number}`;
            details.appendChild(toEl);
        }

        if (details.children.length) {
            td.appendChild(details);
        }

        if (entry.invoice_date) {
            const dateEl = document.createElement('div');
            dateEl.className = 'doc-date';
            dateEl.textContent = dateFormatter.format(new Date(entry.invoice_date));
            td.appendChild(dateEl);
        }

        if (entry.is_within_filters) {
            td.classList.add('doc-cell--in-range');
        }

        return td;
    }

    function buildCellTooltip(entry, stage) {
        const parts = [];
        if (stage && stage.column_label) {
            parts.push(stage.column_label);
        }
        parts.push(`Invoice ID: ${entry.invoice_id}`);
        if (entry.invoice_number) {
            parts.push(`Number: ${entry.invoice_number}`);
        }
        if (entry.invoice_date) {
            parts.push(`Date: ${dateFormatter.format(new Date(entry.invoice_date))}`);
        }
        if (entry.converted_from_invoice_number) {
            parts.push(`From: ${entry.converted_from_invoice_number}`);
        }
        if (entry.converted_to_invoice_number) {
            parts.push(`To: ${entry.converted_to_invoice_number}`);
        }
        return parts.join(' | ');
    }

    init();
})();
