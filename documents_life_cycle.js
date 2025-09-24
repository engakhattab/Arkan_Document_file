(function () {
    const form = document.getElementById('filters-form');
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');
    const stagesContainer = document.getElementById('stages-container');
    const summaryBar = document.getElementById('summary-bar');
    const lastUpdated = document.getElementById('last-updated');
    const quickRangeButtons = document.querySelectorAll('.quick-range button');

    const numberFormatter = new Intl.NumberFormat('ar-EG');
    const currencyFormatter = new Intl.NumberFormat('ar-EG', {
        style: 'currency',
        currency: 'EGP',
        maximumFractionDigits: 2,
    });

    const operationConfig = {
        '+': { css: 'plus', label: 'يدخل إلى المخزون' },
        '-': { css: 'minus', label: 'يخرج من المخزون' },
        '=': { css: 'equal', label: 'لا يغيّر المخزون' },
    };

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function initializeDateInputs() {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        dateFromInput.value = formatDate(startOfMonth);
        dateToInput.value = formatDate(today);
    }

    function setQuickRange(range) {
        const today = new Date();
        let fromDate = new Date(today);

        if (range === 'today') {
            // leave fromDate as today
        } else if (range === 'week') {
            const weekday = today.getDay(); // Sunday = 0
            const diff = weekday === 0 ? 6 : weekday - 1; // start week on Monday
            fromDate.setDate(today.getDate() - diff);
        } else if (range === 'month') {
            fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        }

        dateFromInput.value = formatDate(fromDate);
        dateToInput.value = formatDate(today);
        fetchAndRender();
    }

    function setLoadingState() {
        stagesContainer.innerHTML = '<div class="empty-state">... جاري تحميل البيانات ...</div>';
        summaryBar.innerHTML = '';
        lastUpdated.textContent = '';
    }

    function setErrorState(message) {
        stagesContainer.innerHTML = `<div class="empty-state">${message}</div>`;
        summaryBar.innerHTML = '';
        lastUpdated.textContent = '';
    }

    function buildStageCard(stage, index) {
        const operation = operationConfig[stage.type_operation] || operationConfig['='];
        const card = document.createElement('article');
        card.className = 'stage-card';

        const header = document.createElement('div');
        header.className = 'stage-header';

        const title = document.createElement('div');
        title.className = 'stage-title';
        title.textContent = stage.type_name || `نوع #${stage.type_id}`;

        const order = document.createElement('div');
        order.className = 'stage-order';
        const orderValue = stage.type_sort_number !== null ? stage.type_sort_number : index + 1;
        order.textContent = `الترتيب ${orderValue}`;

        header.appendChild(title);
        header.appendChild(order);
        card.appendChild(header);

        if (stage.type_hex_color) {
            card.style.setProperty('border-top', `8px solid ${stage.type_hex_color}`);
            card.style.setProperty('padding-top', '16px');
        }

        const operationBadge = document.createElement('div');
        operationBadge.className = `stage-operation ${operation.css}`;
        operationBadge.innerHTML = `<span>${stage.type_operation}</span><span>${operation.label}</span>`;
        card.appendChild(operationBadge);

        const metricsWrapper = document.createElement('div');

        const countRow = document.createElement('div');
        countRow.className = 'stage-metric';
        countRow.innerHTML = `<span>عدد المستندات</span><strong>${numberFormatter.format(stage.document_count)}</strong>`;

        const totalRow = document.createElement('div');
        totalRow.className = 'stage-metric';
        totalRow.innerHTML = `<span>إجمالي القيمة</span><strong>${currencyFormatter.format(stage.document_total || 0)}</strong>`;

        metricsWrapper.appendChild(countRow);
        metricsWrapper.appendChild(totalRow);
        card.appendChild(metricsWrapper);

        return card;
    }

    function renderData(payload) {
        summaryBar.innerHTML = '';
        stagesContainer.innerHTML = '';

        const totalDocsChip = document.createElement('div');
        totalDocsChip.className = 'summary-chip';
        totalDocsChip.innerHTML = `<span>إجمالي المستندات</span><strong>${numberFormatter.format(payload.summary.total_documents || 0)}</strong>`;

        const totalAmountChip = document.createElement('div');
        totalAmountChip.className = 'summary-chip';
        totalAmountChip.innerHTML = `<span>إجمالي القيم</span><strong>${currencyFormatter.format(payload.summary.total_amount || 0)}</strong>`;

        summaryBar.appendChild(totalDocsChip);
        summaryBar.appendChild(totalAmountChip);

        if (!payload.stages || payload.stages.length === 0) {
            setErrorState('لم يتم العثور على مراحل نشطة. رجاءً تعيين أرقام ترتيب لأنواع الفواتير المطلوبة.');
            return;
        }

        payload.stages.forEach((stage, index) => {
            stagesContainer.appendChild(buildStageCard(stage, index));
        });

        lastUpdated.textContent = `آخر تحديث: ${new Date().toLocaleString('ar-EG')}`;
    }

    function fetchAndRender() {
        const fromValue = dateFromInput.value;
        const toValue = dateToInput.value;

        if (!fromValue || !toValue) {
            setErrorState('يرجى اختيار تاريخ البداية والنهاية.');
            return;
        }

        if (new Date(fromValue) > new Date(toValue)) {
            setErrorState('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
            return;
        }

        setLoadingState();

        const params = new URLSearchParams({
            date_from: fromValue,
            date_to: toValue,
        });

        fetch(`documents_life_cycle_data.php?${params.toString()}`)
            .then((response) => {
                if (!response.ok) {
                    throw new Error('فشل الاتصال بالخادم');
                }
                return response.json();
            })
            .then((data) => {
                if (data.error) {
                    throw new Error(data.error);
                }
                renderData(data);
            })
            .catch((error) => {
                console.error('Life cycle fetch error:', error);
                setErrorState('تعذر تحميل البيانات. حاول مرة أخرى لاحقاً.');
            });
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        fetchAndRender();
    });

    quickRangeButtons.forEach((button) => {
        button.addEventListener('click', () => setQuickRange(button.dataset.range));
    });

    initializeDateInputs();
    fetchAndRender();
})();