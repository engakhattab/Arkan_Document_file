document.addEventListener('DOMContentLoaded', function () {
    // --- STATE & ELEMENT SELECTORS ---
    let currentPage = 1;
    const resultsPerPage = 17;
    let currentSortBy = 'invoice_create_date'; // Default sort column
    let currentSortOrder = 'DESC'; // Default sort order
    const paymentsModal = document.getElementById('payments-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const paymentsDetailsBody = document.querySelector('#payments-details-table tbody');
    const filterForm = document.getElementById('filterForm');
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

    // --- MAIN SEARCH FORM LOGIC ---
    filterForm.addEventListener('submit', function (event) {
        event.preventDefault();
        currentPage = 1; // Reset to page 1 for every new search
        performSearch();
    });

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
    function updateSummaryBar(totalSum, totalCount) {
        summaryBar.innerHTML = '';
        if (totalCount === 0) return;

        // Format the numbers
        const formattedSum = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(totalSum || 0);
        const formattedCount = new Intl.NumberFormat('ar-EG').format(totalCount);

        // Create the HTML structure
        summaryBar.innerHTML = `
        <span>إجمالي المبلغ: <strong>${formattedSum}</strong></span>
        <span class="summary-divider">|</span>
        <span>عدد الفواتير: <strong>${formattedCount}</strong></span>
    `;
    }

    function populateTable(invoices) {
        tableBody.innerHTML = '';
        if (!invoices || invoices.length === 0) {
            noResultsDiv.style.display = 'block';
        } else {
            noResultsDiv.style.display = 'none';
            invoices.forEach(doc => {
                const formattedTotal = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(doc.invoice_total || 0);

                // Logic for the payments cell
                let paymentsCellContent = '';
                if (doc.payment_count > 0) {
                    paymentsCellContent = `<span class="payments-link" data-invoice-id="${doc.invoice_id}">${doc.payment_count}</span>`;
                } else {
                    paymentsCellContent = `<span class="payments-none">•</span>`;
                }

                const row = `<tr>
                <td>${doc.invoice_number || ''}</td>
                <td>${doc.invoice_create_date || ''}</td>
                <td>${formattedTotal}</td>
                <td>${doc.employee_name || 'N/A'}</td>
                <td>${doc.customer_name || 'N/A'}</td>
                <td>${paymentsCellContent}</td> <!-- NEW CELL CONTENT -->
            </tr>`;
                tableBody.innerHTML += row;
            });
        }
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

    function setupPagination(totalCount) {
        paginationControls.innerHTML = '';
        const totalPages = Math.ceil(totalCount / resultsPerPage);

        if (totalPages <= 1) return;

        // Helper function to create a page button
        const createPageButton = (pageNumber) => {
            const button = document.createElement('button');
            button.textContent = pageNumber;
            if (pageNumber === currentPage) {
                button.classList.add('active');
            }
            button.addEventListener('click', () => {
                currentPage = pageNumber;
                performSearch();
            });
            return button;
        };

        // Helper function to create an ellipsis
        const createEllipsis = () => {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'ellipsis';
            ellipsis.textContent = '...';
            return ellipsis;
        };

        // "Previous" Button
        const prevButton = document.createElement('button');
        prevButton.textContent = 'السابق';
        prevButton.disabled = (currentPage === 1);
        prevButton.addEventListener('click', () => {
            if (currentPage > 1) { currentPage--; performSearch(); }
        });
        paginationControls.appendChild(prevButton);

        // Logic for creating page number buttons with ellipsis
        if (totalPages <= 7) { // If 7 or fewer pages, show all
            for (let i = 1; i <= totalPages; i++) {
                paginationControls.appendChild(createPageButton(i));
            }
        } else { // If more than 7 pages, use ellipsis logic
            const pageNumbersToShow = new Set();
            pageNumbersToShow.add(1);
            pageNumbersToShow.add(totalPages);
            pageNumbersToShow.add(currentPage);
            if (currentPage > 1) pageNumbersToShow.add(currentPage - 1);
            if (currentPage < totalPages) pageNumbersToShow.add(currentPage + 1);

            let lastPage = 0;
            const sortedPages = Array.from(pageNumbersToShow).sort((a, b) => a - b);

            for (const page of sortedPages) {
                if (lastPage > 0 && page > lastPage + 1) {
                    paginationControls.appendChild(createEllipsis());
                }
                paginationControls.appendChild(createPageButton(page));
                lastPage = page;
            }
        }

        // "Next" Button
        const nextButton = document.createElement('button');
        nextButton.textContent = 'التالي';
        nextButton.disabled = (currentPage === totalPages);
        nextButton.addEventListener('click', () => {
            if (currentPage < totalPages) { currentPage++; performSearch(); }
        });
        paginationControls.appendChild(nextButton);
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
                // If it's the same column, reverse the order
                currentSortOrder = currentSortOrder === 'DESC' ? 'ASC' : 'DESC';
            } else {
                // If it's a new column, set it and default to descending
                currentSortBy = sortBy;
                currentSortOrder = 'DESC';
            }
            currentPage = 1; // Go back to the first page
            performSearch();
        });
    });

    function updateSortIcons() {
        document.querySelectorAll('#resultsTable th[data-sort]').forEach(header => {
            const icon = header.querySelector('.sort-icon');
            if (header.getAttribute('data-sort') === currentSortBy) {
                icon.textContent = currentSortOrder === 'DESC' ? '▼' : '▲';
            } else {
                icon.textContent = ' '; // Clear icon for non-active columns
            }
        });
    }
});