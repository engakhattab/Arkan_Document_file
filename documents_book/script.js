document.addEventListener('DOMContentLoaded', function () {
    let allInvoices = [];         // Holds all data from the server, never changes after load.
    let filteredInvoices = [];    // Holds data after main filters (date, names) are applied.
    let displayedInvoices = [];   // Holds data after live search and sorting, ready for display.
    // --- STATE & ELEMENT SELECTORS ---
    let currentPage = 1;
    const resultsPerPage = 17;
    let currentSortBy = 'invoice_create_date'; // Default sort column
    let currentSortOrder = 'DESC'; // Default sort order
    const paymentsModal = document.getElementById('payments-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const paymentsDetailsBody = document.querySelector('#payments-details-table tbody');
    const filterForm = document.getElementById('filterForm');
    const liveSearchInput = document.getElementById('liveSearchInput');

    const tableBody = document.querySelector('#resultsTable tbody');
    const noResultsDiv = document.getElementById('no-results');
    const paginationControls = document.getElementById('pagination-controls');
    const dateFromInput = document.getElementById('date_from');
    const dateToInput = document.getElementById('date_to');
    const employeeInput = document.getElementById('employee_name');
    const customerInput = document.getElementById('customer_name');
    const employeeSuggestions = document.getElementById('employee_suggestions');
    const customerSuggestions = document.getElementById('customer_suggestions');
    const summaryBar = document.getElementById('summary-bar'); // Add this selector

    function initializeData() {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">جاري تحميل البيانات الأولية...</td></tr>`;
        fetch('search.php')
            .then(response => response.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                allInvoices = data;
                applyMainFilters(); // Apply default filters (which is none) and render the page.
            })
            .catch(error => {
                console.error('Initial data load error:', error);
                tableBody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">فشل تحميل البيانات. يرجى تحديث الصفحة.</td></tr>`;
            });
    }
    // --- MAIN SEARCH FORM LOGIC ---
    filterForm.addEventListener('submit', (e) => { e.preventDefault(); applyMainFilters(); });
    liveSearchInput.addEventListener('input', applyLiveSearch);

    // --- CORE LOGIC ---

    // 1. Applies the main form filters
    function applyMainFilters() {
        const formData = new FormData(filterForm);
        const dateFrom = formData.get('date_from');
        const dateTo = formData.get('date_to');
        const docNumber = formData.get('doc_number'); // The search term e.g., "82"
        const employeeName = formData.get('employee_name').toLowerCase();
        const customerName = formData.get('customer_name').toLowerCase();

        filteredInvoices = allInvoices.filter(invoice => {
            const invoiceDate = new Date(invoice.invoice_create_date.split(' ')[0]);
            const checkDateFrom = !dateFrom || invoiceDate >= new Date(dateFrom);
            const checkDateTo = !dateTo || invoiceDate <= new Date(dateTo);

            // --- THIS IS THE FIX ---
            // Change from .includes() to === for an exact match
            const checkDocNumber = !docNumber || invoice.invoice_number.toString() === docNumber;

            const checkEmployee = !employeeName || (invoice.employee_name && invoice.employee_name.toLowerCase().includes(employeeName));
            const checkCustomer = !customerName || (invoice.customer_name && invoice.customer_name.toLowerCase().includes(customerName));

            return checkDateFrom && checkDateTo && checkDocNumber && checkEmployee && checkCustomer;
        });

        // After filtering, apply the live search and update the page
        applyLiveSearch();
    }

    // 2. Applies the live search filter
    function applyLiveSearch() {
        const searchTerm = liveSearchInput.value.toLowerCase();
        if (!searchTerm) {
            displayedInvoices = [...filteredInvoices];
        } else {
            displayedInvoices = filteredInvoices.filter(invoice => {
                return Object.values(invoice).some(value =>
                    value && value.toString().toLowerCase().includes(searchTerm)
                );
            });
        }
        applySorting(); // Always apply sorting after filtering
    }
    function applySorting() {
        displayedInvoices.sort((a, b) => {
            let valA = a[currentSortBy];
            let valB = b[currentSortBy];

            // Handle numeric sorting for total and number
            if (currentSortBy === 'invoice_total' || currentSortBy === 'invoice_number') {
                valA = parseFloat(valA || 0);
                valB = parseFloat(valB || 0);
            }

            if (valA < valB) return currentSortOrder === 'ASC' ? -1 : 1;
            if (valA > valB) return currentSortOrder === 'ASC' ? 1 : -1;
            return 0;
        });

        currentPage = 1; // Reset to page 1 after any filter/sort change
        updatePage();
    }

    // 4. Central function to update all UI elements
    function updatePage() {
        populateTable();
        setupPagination();
        updateSummaryBar();
        updateSortIcons();
    }


    function performSearch() {
        tableBody.scrollIntoView({ behavior: 'smooth', block: 'start' });
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">جاري البحث...</td></tr>';
        noResultsDiv.style.display = 'none';
        paginationControls.innerHTML = '';
        summaryBar.innerHTML = ''; // Clear summary bar on new search

        const formData = new FormData(filterForm);
        const queryString = new URLSearchParams(formData).toString();

        fetch(`search.php?${queryString}&page=${currentPage}&sort_by=${currentSortBy}&sort_order=${currentSortOrder}`)
            .then(response => response.json())
            .then(data => {
                populateTable(data.invoices);
                setupPagination(data.total_count);
                // Call the updated summary function with both values
                updateSummaryBar(data.total_sum, data.total_count);
            })
            .catch(error => {
                console.error('Error fetching data:', error);
                tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: red;">حدث خطأ أثناء جلب البيانات.</td></tr>';
            });
    }
    // --- NEW: SUMMARY BAR UPDATE FUNCTION ---
    function updateSummaryBar() {
        summaryBar.innerHTML = '';
        const totalCount = displayedInvoices.length;
        if (totalCount === 0) return;
        const totalSum = displayedInvoices.reduce((sum, invoice) => sum + parseFloat(invoice.invoice_total || 0), 0);
        const formattedSum = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(totalSum);
        const formattedCount = new Intl.NumberFormat('ar-EG').format(totalCount);
        summaryBar.innerHTML = `
            <span>إجمالي النتائج: <strong>${formattedSum}</strong></span>
            <span class="summary-divider">|</span>
            <span>عدد الفواتير: <strong>${formattedCount}</strong></span>
        `;
    }

    function populateTable() {
        tableBody.innerHTML = '';
        const searchTerm = liveSearchInput.value;
        const start = (currentPage - 1) * resultsPerPage;
        const end = start + resultsPerPage;
        const paginatedInvoices = displayedInvoices.slice(start, end);

        if (paginatedInvoices.length === 0) {
            noResultsDiv.style.display = 'block';
            return;
        }
        noResultsDiv.style.display = 'none';

        const highlight = (text) => {
            if (!searchTerm || !text) return text;
            const regex = new RegExp(searchTerm, 'gi');
            return text.toString().replace(regex, match => `<span class="highlight">${match}</span>`);
        };

        paginatedInvoices.forEach(doc => {
            const formattedTotal = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(doc.invoice_total || 0);
            const paymentsCellContent = doc.payment_count > 0 ? `<span class="payments-link" data-invoice-id="${doc.invoice_id}">${doc.payment_count}</span>` : `<span class="payments-none">•</span>`;
            const row = `<tr>
                <td>${highlight(doc.invoice_number)}</td>
                <td>${highlight(doc.invoice_create_date)}</td>
                <td>${highlight(formattedTotal)}</td>
                <td>${highlight(doc.employee_name) || 'N/A'}</td>
                <td>${highlight(doc.customer_name) || 'N/A'}</td>
                <td>${paymentsCellContent}</td>
            </tr>`;
            tableBody.innerHTML += row;
        });
    }

    tableBody.addEventListener('click', function (event) {
        const target = event.target;
        if (target.classList.contains('payments-link')) {
            const invoiceId = target.getAttribute('data-invoice-id');
            showPaymentsModal(invoiceId);
        }
    });
    function showPaymentsModal(invoiceId) {
        paymentsDetailsBody.innerHTML = '<tr><td colspan="2">جاري تحميل الدفعات...</td></tr>';
        paymentsModal.style.display = 'flex';
        setTimeout(() => { // Allows for smooth transition
            paymentsModal.style.opacity = '1';
            paymentsModal.querySelector('.modal-content').style.transform = 'translateY(0)';
        }, 10);

        fetch(`get_payments.php?invoice_id=${invoiceId}`)
            .then(response => response.json())
            .then(payments => {
                paymentsDetailsBody.innerHTML = '';
                if (payments.length > 0) {
                    payments.forEach(payment => {
                        const paymentAmount = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(payment.entry_amount || 0);
                        const row = `<tr>
                        <td>${payment.entry_date || 'N/A'}</td>
                        <td>${paymentAmount}</td>
                    </tr>`;
                        paymentsDetailsBody.innerHTML += row;
                    });
                } else {
                    paymentsDetailsBody.innerHTML = '<tr><td colspan="2">لا توجد دفعات مسجلة لهذه الفاتورة.</td></tr>';
                }
            })
            .catch(error => {
                console.error('Error fetching payment details:', error);
                paymentsDetailsBody.innerHTML = '<tr><td colspan="2" style="color: red;">حدث خطأ في تحميل البيانات.</td></tr>';
            });
    }

    function hidePaymentsModal() {
        paymentsModal.style.opacity = '0';
        paymentsModal.querySelector('.modal-content').style.transform = 'translateY(-50px)';
        setTimeout(() => {
            paymentsModal.style.display = 'none';
        }, 300); // Wait for transition to finish
    }

    modalCloseBtn.addEventListener('click', hidePaymentsModal);
    paymentsModal.addEventListener('click', function (event) {
        if (event.target === paymentsModal) { // Close if clicking on the overlay
            hidePaymentsModal();
        }
    });

    function setupPagination() {
        paginationControls.innerHTML = '';
        const totalPages = Math.ceil(displayedInvoices.length / resultsPerPage);
        if (totalPages <= 1) return;

        const createPageButton = (page, text = page, isDisabled = false) => {
            const button = document.createElement('button');
            button.textContent = text;
            button.disabled = isDisabled;
            if (page === currentPage) button.classList.add('active');
            button.addEventListener('click', () => {
                currentPage = page;
                updatePage();
                tableBody.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            return button;
        };

        paginationControls.appendChild(createPageButton(currentPage - 1, 'السابق', currentPage === 1));

        // Ellipsis logic here for page numbers
        // This is a simplified version, you can enhance it further
        for (let i = 1; i <= totalPages; i++) {
            paginationControls.appendChild(createPageButton(i));
        }

        paginationControls.appendChild(createPageButton(currentPage + 1, 'التالي', currentPage === totalPages));
    }

    // --- DATE PRESET LOGIC ---
    document.getElementById('btnToday').addEventListener('click', () => setDateRange('today'));
    document.getElementById('btnThisWeek').addEventListener('click', () => setDateRange('week'));
    document.getElementById('btnThisMonth').addEventListener('click', () => setDateRange('month'));

    function setDateRange(period) {
        const today = new Date();
        let startDate = new Date();

        if (period === 'today') { /* Start date is today */ }
        else if (period === 'week') {
            const dayOfWeek = today.getDay(); // Sunday=0, Monday=1, Saturday=6
            const daysToSubtract = (dayOfWeek + 1) % 7;
            startDate.setDate(today.getDate() - daysToSubtract);
        } else if (period === 'month') {
            startDate.setDate(1);
        }

        dateFromInput.value = formatDate(startDate);
        dateToInput.value = formatDate(today);
    }

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // --- AUTOCOMPLETE LOGIC ---
    employeeInput.addEventListener('focus', () => getSuggestions('employee', employeeInput.value, employeeSuggestions));
    employeeInput.addEventListener('input', () => getSuggestions('employee', employeeInput.value, employeeSuggestions));
    customerInput.addEventListener('focus', () => getSuggestions('customer', customerInput.value, customerSuggestions));
    customerInput.addEventListener('input', () => getSuggestions('customer', customerInput.value, customerSuggestions));

    let debounceTimer;
    function getSuggestions(type, term, suggestionsBox) {
        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
            fetch(`autocomplete.php?type=${type}&term=${term}`)
                .then(response => response.json())
                .then(data => {
                    displaySuggestions(data, suggestionsBox, (type === 'employee' ? employeeInput : customerInput));
                })
                .catch(error => console.error('Autocomplete error:', error));
        }, 150);
    }

    function displaySuggestions(suggestions, suggestionsBox, inputField) {
        suggestionsBox.innerHTML = '';
        if (suggestions.length === 0) return;

        suggestions.forEach(suggestion => {
            const div = document.createElement('div');
            div.textContent = suggestion;
            div.addEventListener('mousedown', (e) => {
                e.preventDefault();
                inputField.value = suggestion;
                suggestionsBox.innerHTML = '';
            });
            suggestionsBox.appendChild(div);
        });
    }

    document.addEventListener('click', function (event) {
        if (!event.target.closest('.filter-group')) {
            employeeSuggestions.innerHTML = '';
            customerSuggestions.innerHTML = '';
        }
    });

    // --- NEW: SORTING LOGIC ---
    document.querySelectorAll('#resultsTable th[data-sort]').forEach(header => {
        header.addEventListener('click', () => {
            const sortBy = header.getAttribute('data-sort');
            if (sortBy === currentSortBy) {
                currentSortOrder = currentSortOrder === 'DESC' ? 'ASC' : 'DESC';
            } else {
                currentSortBy = sortBy;
                currentSortOrder = 'DESC';
            }
            applySorting();
        });
    });

    function updateSortIcons() {
        document.querySelectorAll('#resultsTable th[data-sort]').forEach(header => {
            const icon = header.querySelector('.sort-icon');
            if (icon) {
                icon.textContent = header.getAttribute('data-sort') === currentSortBy
                    ? (currentSortOrder === 'DESC' ? '▼' : '▲')
                    : ' ';
            }
        });
    }
    initializeData();

});