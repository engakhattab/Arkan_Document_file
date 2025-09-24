(function () {
    const form = document.getElementById("filters-form");
    const dateFromInput = document.getElementById("date-from");
    const dateToInput = document.getElementById("date-to");
    const customerSelect = document.getElementById("customer-select");
    const supplierSelect = document.getElementById("supplier-select");
    const resetButton = document.getElementById("reset-filters");
    const quickRangeButtons = document.querySelectorAll(".quick-range button");
    const summaryBar = document.getElementById("summary-bar");
    const tableHeadRow = document.getElementById("table-head-row");
    const tableBody = document.getElementById("table-body");
    const tableEmpty = document.getElementById("table-empty");
    const lastUpdated = document.getElementById("last-updated");

    const numberFormatter = new Intl.NumberFormat("ar-EG");
    const currencyFormatter = new Intl.NumberFormat("ar-EG", {
        style: "currency",
        currency: "EGP",
        maximumFractionDigits: 2,
    });
    const dateFormatter = new Intl.DateTimeFormat("ar-EG");

    const operationLabels = {
        "+": "يدخل إلى المخزون",
        "-": "يخرج من المخزون",
        "=": "لا يغيّر المخزون",
    };

    let stageDefinitions = [];

    function formatDateInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function initializeDateInputs() {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        dateFromInput.value = formatDateInput(startOfMonth);
        dateToInput.value = formatDateInput(today);
    }

    function setQuickRange(range) {
        const today = new Date();
        let fromDate = new Date(today);

        if (range === "week") {
            const weekday = today.getDay();
            const diff = weekday === 0 ? 6 : weekday - 1;
            fromDate.setDate(today.getDate() - diff);
        } else if (range === "month") {
            fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        }

        dateFromInput.value = formatDateInput(fromDate);
        dateToInput.value = formatDateInput(today);
        fetchAndRender();
    }

    function showEmptyState(message, isError = false) {
        tableBody.innerHTML = "";
        tableEmpty.hidden = false;
        tableEmpty.textContent = message;
        tableEmpty.classList.toggle("danger", isError);
    }

    function hideEmptyState() {
        tableEmpty.hidden = true;
        tableEmpty.textContent = "";
        tableEmpty.classList.remove("danger");
    }

    function setLoadingState() {
        summaryBar.innerHTML = "";
        lastUpdated.textContent = "";
        showEmptyState("... جاري تحميل البيانات ...");
    }

    function setErrorState(message) {
        summaryBar.innerHTML = "";
        lastUpdated.textContent = "";
        showEmptyState(message, true);
    }

    function populateSelect(selectElement, options, placeholder) {
        const previousValue = selectElement.value;
        selectElement.innerHTML = "";

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = placeholder;
        selectElement.appendChild(defaultOption);

        options.forEach(option => {
            const opt = document.createElement("option");
            opt.value = String(option.id);
            opt.textContent = option.label;
            selectElement.appendChild(opt);
        });

        if (previousValue && selectElement.querySelector(`option[value="${previousValue}"]`)) {
            selectElement.value = previousValue;
        }
    }

    function populateLookups(lookups) {
        if (lookups.customers) {
            const customerOptions = lookups.customers.map(item => ({
                id: item.customer_id,
                label: item.customer_name || `عميل #${item.customer_id}`,
            }));
            populateSelect(customerSelect, customerOptions, "كل العملاء");
        }

        if (lookups.suppliers) {
            const supplierOptions = lookups.suppliers.map(item => ({
                id: item.supplier_id,
                label: item.supplier_name || `مورد #${item.supplier_id}`,
            }));
            populateSelect(supplierSelect, supplierOptions, "كل الموردين");
        }
    }

    function buildTableHeader() {
        tableHeadRow.innerHTML = "";

        const baseColumns = ["#", "العميل", "المورد", "آخر مستند"];
        baseColumns.forEach(label => {
            const th = document.createElement("th");
            th.textContent = label;
            tableHeadRow.appendChild(th);
        });

        stageDefinitions.forEach(stage => {
            const th = document.createElement("th");
            th.className = "stage-column";
            if (stage.type_hex_color) {
                th.style.setProperty("--stage-color", stage.type_hex_color);
            }

            const title = document.createElement("span");
            title.className = "stage-head-title";
            title.textContent = stage.type_name;

            const meta = document.createElement("span");
            meta.className = "stage-head-meta";
            const operationLabel = operationLabels[stage.type_operation] || "";
            meta.textContent = `الترتيب ${stage.type_sort_number} • ${operationLabel}`;

            th.appendChild(title);
            th.appendChild(meta);
            tableHeadRow.appendChild(th);
        });

        ["إجمالي المستندات", "إجمالي القيمة"].forEach(label => {
            const th = document.createElement("th");
            th.textContent = label;
            tableHeadRow.appendChild(th);
        });
    }

    function renderSummary(summary = {}) {
        summaryBar.innerHTML = "";

        const cards = [
            { label: "عدد السجلات", value: numberFormatter.format(summary.rows_count || 0) },
            { label: "إجمالي المستندات", value: numberFormatter.format(summary.total_documents || 0) },
            { label: "إجمالي القيم", value: currencyFormatter.format(summary.total_amount || 0) },
        ];

        cards.forEach(card => {
            const chip = document.createElement("div");
            chip.className = "summary-chip";
            const label = document.createElement("span");
            label.textContent = card.label;
            const value = document.createElement("strong");
            value.textContent = card.value;
            chip.appendChild(label);
            chip.appendChild(value);
            summaryBar.appendChild(chip);
        });
    }

    function renderTableRows(rows = []) {
        if (!stageDefinitions.length) {
            showEmptyState("لا يوجد أي نوع فاتورة يحمل ترتيبًا. يرجى ضبط type_sort_number للمراحل المطلوبة.");
            return;
        }

        tableBody.innerHTML = "";

        if (!rows.length) {
            showEmptyState("لا توجد سجلات للمعايير المحددة.");
            return;
        }

        hideEmptyState();

        rows.forEach((row, index) => {
            const tr = document.createElement("tr");

            const indexCell = document.createElement("td");
            indexCell.textContent = numberFormatter.format(index + 1);
            tr.appendChild(indexCell);

            const customerCell = document.createElement("td");
            customerCell.textContent = row.customer_name || "-";
            tr.appendChild(customerCell);

            const supplierCell = document.createElement("td");
            supplierCell.textContent = row.supplier_name || "-";
            tr.appendChild(supplierCell);

            const dateCell = document.createElement("td");
            dateCell.textContent = row.last_invoice_date ? dateFormatter.format(new Date(row.last_invoice_date)) : "-";
            tr.appendChild(dateCell);

            stageDefinitions.forEach(stage => {
                const stageCell = document.createElement("td");
                stageCell.className = "stage-cell";
                const stageData = row.stages ? row.stages[String(stage.type_id)] || row.stages[stage.type_id] : null;
                const countValue = stageData ? stageData.document_count : 0;
                const amountValue = stageData ? stageData.document_total : 0;

                const wrapper = document.createElement("div");
                wrapper.className = "stage-cell-content";

                const countLine = document.createElement("div");
                countLine.className = "stage-line";
                const countLabel = document.createElement("span");
                countLabel.textContent = "عدد";
                const countStrong = document.createElement("strong");
                countStrong.textContent = numberFormatter.format(countValue);
                countLine.appendChild(countLabel);
                countLine.appendChild(countStrong);

                const amountLine = document.createElement("div");
                amountLine.className = "stage-line";
                const amountLabel = document.createElement("span");
                amountLabel.textContent = "قيمة";
                const amountStrong = document.createElement("strong");
                amountStrong.textContent = currencyFormatter.format(amountValue);
                amountLine.appendChild(amountLabel);
                amountLine.appendChild(amountStrong);

                wrapper.appendChild(countLine);
                wrapper.appendChild(amountLine);
                stageCell.appendChild(wrapper);
                tr.appendChild(stageCell);
            });

            const totalDocsCell = document.createElement("td");
            totalDocsCell.textContent = numberFormatter.format(row.total_documents || 0);
            tr.appendChild(totalDocsCell);

            const totalAmountCell = document.createElement("td");
            totalAmountCell.textContent = currencyFormatter.format(row.total_amount || 0);
            tr.appendChild(totalAmountCell);

            tableBody.appendChild(tr);
        });
    }

    function fetchAndRender() {
        const fromValue = dateFromInput.value;
        const toValue = dateToInput.value;

        if (!fromValue || !toValue) {
            setErrorState("يرجى اختيار تاريخ البداية والنهاية.");
            return;
        }

        if (new Date(fromValue) > new Date(toValue)) {
            setErrorState("تاريخ البداية يجب أن يكون قبل تاريخ النهاية.");
            return;
        }

        const params = new URLSearchParams({
            date_from: fromValue,
            date_to: toValue,
        });

        if (customerSelect.value) {
            params.set("customer_id", customerSelect.value);
        }

        if (supplierSelect.value) {
            params.set("supplier_id", supplierSelect.value);
        }

        setLoadingState();

        fetch(`documents_life_cycle_data.php?${params.toString()}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                return response.json();
            })
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }

                stageDefinitions = data.stages || [];
                buildTableHeader();
                populateLookups(data.lookups || {});
                renderSummary(data.summary || {});
                renderTableRows(data.rows || []);
                lastUpdated.textContent = `آخر تحديث: ${new Date().toLocaleString("ar-EG")}`;
            })
            .catch(error => {
                console.error("Life cycle fetch error:", error);
                setErrorState("تعذر تحميل البيانات. حاول مرة أخرى لاحقاً.");
            });
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        fetchAndRender();
    });

    resetButton.addEventListener("click", () => {
        customerSelect.value = "";
        supplierSelect.value = "";
        initializeDateInputs();
        fetchAndRender();
    });

    quickRangeButtons.forEach(button => {
        button.addEventListener("click", () => setQuickRange(button.dataset.range));
    });

    initializeDateInputs();
    fetchAndRender();
})();