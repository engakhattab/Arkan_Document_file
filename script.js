document.addEventListener('DOMContentLoaded', function () {
    // --- ELEMENT SELECTORS ---
    const filterForm = document.getElementById('filterForm');
    const tableBody = document.querySelector('#resultsTable tbody');
    const noResultsDiv = document.getElementById('no-results');
    const dateFromInput = document.getElementById('date_from');
    const dateToInput = document.getElementById('date_to');

    // --- MAIN SEARCH FORM ---
    filterForm.addEventListener('submit', function (event) {
        event.preventDefault();
        performSearch();
    });

    function performSearch() {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">جاري البحث...</td></tr>';
        noResultsDiv.style.display = 'none';

        const formData = new FormData(filterForm);
        const queryString = new URLSearchParams(formData).toString();

        fetch(`search.php?${queryString}`)
            .then(response => response.json())
            .then(data => { populateTable(data); })
            .catch(error => {
                console.error('Error fetching data:', error);
                tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: red;">حدث خطأ أثناء جلب البيانات.</td></tr>';
            });
    }

    function populateTable(documents) {
        tableBody.innerHTML = '';
        if (documents.length === 0 || documents.error) {
            noResultsDiv.style.display = 'block';
        } else {
            noResultsDiv.style.display = 'none';
            documents.forEach(doc => {
                const row = `<tr>
                    <td>${doc.invoice_number || ''}</td>
                    <td>${doc.invoice_create_date || ''}</td>
                    <td>${doc.employee_name || 'N/A'}</td>
                    <td>${doc.customer_name || 'N/A'}</td>
                </tr>`;
                tableBody.innerHTML += row;
            });
        }
    }

    // --- DATE PRESET LOGIC ---
    document.getElementById('btnToday').addEventListener('click', () => setDateRange('today'));
    document.getElementById('btnThisWeek').addEventListener('click', () => setDateRange('week'));
    document.getElementById('btnThisMonth').addEventListener('click', () => setDateRange('month'));

    // This function replaces the old setDateRange function in script.js
    function setDateRange(period) {
        const today = new Date();
        let startDate = new Date();

        if (period === 'today') {
            // Start date is today
        } else if (period === 'week') {
            // CORRECTED: Logic for a week starting on Saturday
            const dayOfWeek = today.getDay(); // Sunday is 0, Saturday is 6
            const daysToSubtract = (dayOfWeek + 1) % 7;
            startDate.setDate(today.getDate() - daysToSubtract);
        } else if (period === 'month') {
            // Start date is the 1st of the month
            startDate.setDate(1);
        }

        dateFromInput.value = formatDate(startDate);
        dateToInput.value = formatDate(today);
    }

    function formatDate(date) {
        // Formats a date to "YYYY-MM-DD" for the input field
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // --- AUTOCOMPLETE LOGIC ---
    const employeeInput = document.getElementById('employee_name');
    const customerInput = document.getElementById('customer_name');
    const employeeSuggestions = document.getElementById('employee_suggestions');
    const customerSuggestions = document.getElementById('customer_suggestions');

    // Attach listeners
    employeeInput.addEventListener('input', () => getSuggestions('employee', employeeInput.value, employeeSuggestions));
    customerInput.addEventListener('input', () => getSuggestions('customer', customerInput.value, customerSuggestions));

    let debounceTimer;
    function getSuggestions(type, term, suggestionsBox) {
        clearTimeout(debounceTimer);
        suggestionsBox.innerHTML = ''; // Clear previous suggestions

        if (term.length < 2) return; // Don't search for less than 2 characters

        debounceTimer = setTimeout(() => {
            fetch(`autocomplete.php?type=${type}&term=${term}`)
                .then(response => response.json())
                .then(data => {
                    displaySuggestions(data, suggestionsBox, (type === 'employee' ? employeeInput : customerInput));
                })
                .catch(error => console.error('Autocomplete error:', error));
        }, 300); // Wait 300ms after user stops typing
    }

    function displaySuggestions(suggestions, suggestionsBox, inputField) {
        suggestionsBox.innerHTML = '';
        if (suggestions.length === 0) return;

        suggestions.forEach(suggestion => {
            const div = document.createElement('div');
            div.textContent = suggestion;
            div.addEventListener('click', () => {
                inputField.value = suggestion; // Set input value on click
                suggestionsBox.innerHTML = ''; // Hide suggestions
            });
            suggestionsBox.appendChild(div);
        });
    }

    // Hide suggestions when clicking outside
    document.addEventListener('click', function (event) {
        if (!event.target.closest('.filter-group')) {
            employeeSuggestions.innerHTML = '';
            customerSuggestions.innerHTML = '';
        }
    });
});