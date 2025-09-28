(function () {
    'use strict';

    const state = {
        cycles: [],
        cyclesMap: {},
        activeCycleId: null,
        invoiceTypes: [],
        invoiceTypeMap: {},
        currentCycleId: null,
        stageOrder: [],
    };

    const dom = {
        cycleList: document.getElementById('cycle-list'),
        addCycleButton: document.getElementById('add-cycle'),
        cycleForm: document.getElementById('cycle-form'),
        cycleName: document.getElementById('cycle-name'),
        availableStageTypes: document.getElementById('available-stage-types'),
        addStageButton: document.getElementById('add-stage'),
        selectedStages: document.getElementById('selected-stages'),
        setActiveButton: document.getElementById('set-active'),
        deleteButton: document.getElementById('delete-cycle'),
        status: document.getElementById('settings-status'),
    };

    function init() {
        attachEventListeners();
        loadSettings();
    }

    function attachEventListeners() {
        if (dom.cycleList) {
            dom.cycleList.addEventListener('click', function (event) {
                const button = event.target.closest('[data-cycle-id]');
                if (!button) {
                    return;
                }
                const cycleId = String(button.dataset.cycleId || '');
                if (!cycleId || !state.cyclesMap[cycleId]) {
                    return;
                }
                loadCycleIntoForm(state.cyclesMap[cycleId]);
            });
        }

        if (dom.addCycleButton) {
            dom.addCycleButton.addEventListener('click', startNewCycle);
        }

        if (dom.addStageButton) {
            dom.addStageButton.addEventListener('click', addSelectedStage);
        }

        if (dom.selectedStages) {
            dom.selectedStages.addEventListener('click', handleStageActions);
            dom.selectedStages.addEventListener('input', handleStageLabelInput);
        }

        if (dom.cycleForm) {
            dom.cycleForm.addEventListener('submit', handleSaveCycle);
        }

        if (dom.deleteButton) {
            dom.deleteButton.addEventListener('click', handleDeleteCycle);
        }

        if (dom.setActiveButton) {
            dom.setActiveButton.addEventListener('click', handleSetActiveCycle);
        }
    }

    function loadSettings() {
        showStatus('Loading settings...', null);
        fetch('documents_life_cycle_settings_api.php')
            .then(function (response) {
                return parseJsonResponse(response, 'Unable to load settings.');
            })
            .then(function (data) {
                state.invoiceTypes = Array.isArray(data.invoice_types) ? data.invoice_types.slice() : [];
                state.invoiceTypes.sort(function (a, b) {
                    const nameA = (a && a.name ? String(a.name) : '').toLowerCase();
                    const nameB = (b && b.name ? String(b.name) : '').toLowerCase();
                    if (nameA === nameB) {
                        return (a.id || 0) - (b.id || 0);
                    }
                    return nameA.localeCompare(nameB);
                });
                state.invoiceTypeMap = {};
                state.invoiceTypes.forEach(function (type) {
                    if (type && typeof type.id !== 'undefined') {
                        state.invoiceTypeMap[String(type.id)] = type;
                    }
                });

                syncCycles(Array.isArray(data.cycles) ? data.cycles : [], data.active_cycle_id || null);

                const defaultId = state.activeCycleId || (state.cycles.length ? state.cycles[0].id : null);
                if (defaultId && state.cyclesMap[String(defaultId)]) {
                    loadCycleIntoForm(state.cyclesMap[String(defaultId)]);
                } else {
                    startNewCycle();
                }

                showStatus('', null);
            })
            .catch(function (error) {
                console.error('Settings load error:', error);
                showStatus(error.message || 'Unable to load settings.', 'error');
            });
    }

    function syncCycles(cycles, activeId) {
        state.cycles = Array.isArray(cycles) ? cycles.slice() : [];
        state.activeCycleId = activeId || null;
        state.cyclesMap = {};
        state.cycles.forEach(function (cycle) {
            if (!cycle || !cycle.id) {
                return;
            }
            state.cyclesMap[String(cycle.id)] = cycle;
        });
        renderCycleList();
    }

    function renderCycleList() {
        if (!dom.cycleList) {
            return;
        }

        dom.cycleList.innerHTML = '';

        if (!state.cycles.length) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'cycle-list-empty';
            emptyItem.textContent = 'No cycles yet. Create a cycle to get started.';
            dom.cycleList.appendChild(emptyItem);
            return;
        }

        state.cycles.forEach(function (cycle) {
            if (!cycle || !cycle.id) {
                return;
            }

            const cycleId = String(cycle.id);
            const li = document.createElement('li');
            li.className = 'cycle-list-item';
            if (state.currentCycleId && state.currentCycleId === cycleId) {
                li.classList.add('is-selected');
            }
            if (state.activeCycleId && String(state.activeCycleId) === cycleId) {
                li.classList.add('is-active');
            }

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'cycle-item-button';
            button.dataset.cycleId = cycleId;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'cycle-name';
            nameSpan.textContent = cycle.name || cycleId;
            button.appendChild(nameSpan);

            if (state.activeCycleId && String(state.activeCycleId) === cycleId) {
                const badge = document.createElement('span');
                badge.className = 'cycle-badge';
                badge.textContent = 'Default';
                button.appendChild(badge);
            }

            li.appendChild(button);
            dom.cycleList.appendChild(li);
        });
    }

    function loadCycleIntoForm(cycle) {
        const cycleData = typeof cycle === 'string' ? state.cyclesMap[cycle] : cycle;
        if (!cycleData) {
            startNewCycle();
            return;
        }

        state.currentCycleId = cycleData.id ? String(cycleData.id) : null;
        if (dom.cycleForm) {
            dom.cycleForm.dataset.cycleId = state.currentCycleId || '';
        }

        if (dom.cycleName) {
            dom.cycleName.value = cycleData.name || '';
        }

        const stageIds = Array.isArray(cycleData.stage_type_ids) ? cycleData.stage_type_ids : [];
        const stageLabels = cycleData.stage_labels || {};
        state.stageOrder = stageIds.map(function (id) {
            const numericId = Number(id);
            const info = state.invoiceTypeMap[String(numericId)] || {};
            return {
                id: numericId,
                name: info.name || `Type ${numericId}`,
                label: stageLabels[numericId] || '',
            };
        });

        renderStageBuilder();
        renderCycleList();
        updateButtonsState();
        showStatus('', null);
    }

    function startNewCycle() {
        state.currentCycleId = null;
        if (dom.cycleForm) {
            dom.cycleForm.dataset.cycleId = '';
        }
        if (dom.cycleName) {
            dom.cycleName.value = '';
        }
        state.stageOrder = [];
        renderStageBuilder();
        renderCycleList();
        updateButtonsState();
        showStatus('', null);
    }

    function renderStageBuilder() {
        renderSelectedStages();
        renderAvailableStageOptions();
    }

    function renderSelectedStages() {
        if (!dom.selectedStages) {
            return;
        }

        dom.selectedStages.innerHTML = '';

        if (!state.stageOrder.length) {
            const empty = document.createElement('li');
            empty.className = 'stage-empty';
            empty.textContent = 'No stages selected for this cycle yet.';
            dom.selectedStages.appendChild(empty);
            return;
        }

        state.stageOrder.forEach(function (stage, index) {
            const li = document.createElement('li');
            li.className = 'stage-item';
            li.dataset.typeId = String(stage.id);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'stage-name';
            nameSpan.textContent = stage.name || `Type ${stage.id}`;
            li.appendChild(nameSpan);

            const labelInput = document.createElement('input');
            labelInput.type = 'text';
            labelInput.className = 'stage-label-input';
            labelInput.placeholder = 'Custom label (optional)';
            labelInput.value = stage.label || '';
            labelInput.dataset.typeId = String(stage.id);
            li.appendChild(labelInput);

            const actions = document.createElement('div');
            actions.className = 'stage-actions';

            const upButton = document.createElement('button');
            upButton.type = 'button';
            upButton.dataset.action = 'up';
            upButton.textContent = 'Up';
            upButton.disabled = index === 0;
            actions.appendChild(upButton);

            const downButton = document.createElement('button');
            downButton.type = 'button';
            downButton.dataset.action = 'down';
            downButton.textContent = 'Down';
            downButton.disabled = index === state.stageOrder.length - 1;
            actions.appendChild(downButton);

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.dataset.action = 'remove';
            removeButton.textContent = 'Remove';
            actions.appendChild(removeButton);

            li.appendChild(actions);
            dom.selectedStages.appendChild(li);
        });
    }

    function renderAvailableStageOptions() {
        if (!dom.availableStageTypes) {
            return;
        }

        dom.availableStageTypes.innerHTML = '';

        if (!state.invoiceTypes.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No invoice types found';
            option.disabled = true;
            option.selected = true;
            dom.availableStageTypes.appendChild(option);
            dom.availableStageTypes.disabled = true;
            return;
        }

        const selectedIds = new Set(state.stageOrder.map(function (stage) { return stage.id; }));
        const available = state.invoiceTypes.filter(function (type) {
            return type && !selectedIds.has(type.id);
        });

        if (!available.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'All types already selected';
            option.disabled = true;
            option.selected = true;
            dom.availableStageTypes.appendChild(option);
            dom.availableStageTypes.disabled = true;
            return;
        }

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Choose invoice type';
        placeholder.disabled = true;
        placeholder.selected = true;
        dom.availableStageTypes.appendChild(placeholder);

        available.forEach(function (type) {
            const option = document.createElement('option');
            option.value = String(type.id);
            option.textContent = type.name || `Type ${type.id}`;
            dom.availableStageTypes.appendChild(option);
        });

        dom.availableStageTypes.disabled = false;
    }

    function addSelectedStage() {
        if (!dom.availableStageTypes || dom.availableStageTypes.disabled) {
            return;
        }

        const value = dom.availableStageTypes.value;
        if (!value) {
            return;
        }

        const typeId = Number(value);
        if (state.stageOrder.some(function (stage) { return stage.id === typeId; })) {
            return;
        }

        const info = state.invoiceTypeMap[String(typeId)] || {};
        state.stageOrder.push({
            id: typeId,
            name: info.name || `Type ${typeId}`,
            label: '',
        });

        renderStageBuilder();
        updateButtonsState();
    }

    function handleStageActions(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) {
            return;
        }

        const li = button.closest('.stage-item');
        if (!li || !li.dataset.typeId) {
            return;
        }

        const stageId = Number(li.dataset.typeId);
        const action = button.dataset.action;

        if (action === 'remove') {
            state.stageOrder = state.stageOrder.filter(function (stage) {
                return stage.id !== stageId;
            });
            renderStageBuilder();
            updateButtonsState();
            return;
        }

        const index = state.stageOrder.findIndex(function (stage) {
            return stage.id === stageId;
        });
        if (index === -1) {
            return;
        }

        if (action === 'up' && index > 0) {
            const temp = state.stageOrder[index - 1];
            state.stageOrder[index - 1] = state.stageOrder[index];
            state.stageOrder[index] = temp;
            renderStageBuilder();
        } else if (action === 'down' && index < state.stageOrder.length - 1) {
            const temp = state.stageOrder[index + 1];
            state.stageOrder[index + 1] = state.stageOrder[index];
            state.stageOrder[index] = temp;
            renderStageBuilder();
        }
    }

    function handleStageLabelInput(event) {
        const input = event.target;
        if (!input || !input.classList.contains('stage-label-input')) {
            return;
        }

        const typeId = Number(input.dataset.typeId || 0);
        const stage = state.stageOrder.find(function (item) {
            return item.id === typeId;
        });
        if (stage) {
            stage.label = input.value || '';
        }
    }

    function handleSaveCycle(event) {
        event.preventDefault();
        if (!dom.cycleName) {
            return;
        }

        const name = dom.cycleName.value.trim();
        if (!name) {
            showStatus('Please enter a cycle name.', 'error');
            return;
        }

        const stageTypeIds = state.stageOrder.map(function (stage) {
            return stage.id;
        });

        if (!stageTypeIds.length) {
            showStatus('Add at least one stage before saving.', 'error');
            return;
        }

        const stageLabels = {};
        state.stageOrder.forEach(function (stage) {
            if (stage.label && stage.label.trim() !== '') {
                stageLabels[stage.id] = stage.label.trim();
            }
        });

        const payload = {
            action: 'save',
            cycle: {
                id: state.currentCycleId || '',
                name: name,
                stage_type_ids: stageTypeIds,
                stage_labels: stageLabels,
                max_auto_stage_count: Math.max(stageTypeIds.length, 1),

            },
        };

        showStatus('Saving cycle...', null);
        sendRequest(payload, 'Unable to save the cycle.')
            .then(function (data) {
                syncCycles(data.cycles, data.active_cycle_id);
                const savedCycle = data.cycle || null;
                if (savedCycle && savedCycle.id) {
                    loadCycleIntoForm(savedCycle);
                } else if (state.currentCycleId && state.cyclesMap[state.currentCycleId]) {
                    loadCycleIntoForm(state.cyclesMap[state.currentCycleId]);
                } else if (state.cycles.length) {
                    loadCycleIntoForm(state.cycles[0]);
                } else {
                    startNewCycle();
                }
                showStatus('Cycle saved successfully.', 'success');
            })
            .catch(function (error) {
                console.error('Save cycle error:', error);
                showStatus(error.message || 'Unable to save the cycle.', 'error');
            });
    }

    function handleDeleteCycle() {
        if (!state.currentCycleId || !state.cyclesMap[state.currentCycleId]) {
            showStatus('Cannot delete an unsaved cycle.', 'error');
            return;
        }

        if (state.cycles.length <= 1) {
            showStatus('At least one cycle must remain.', 'error');
            return;
        }

        if (!window.confirm('Are you sure you want to delete this cycle?')) {
            return;
        }

        showStatus('Deleting cycle...', null);
        sendRequest({ action: 'delete', cycle_id: state.currentCycleId }, 'Unable to delete the cycle.')
            .then(function (data) {
                syncCycles(data.cycles, data.active_cycle_id);
                if (state.cycles.length) {
                    const nextId = state.activeCycleId || state.cycles[0].id;
                    if (nextId && state.cyclesMap[String(nextId)]) {
                        loadCycleIntoForm(state.cyclesMap[String(nextId)]);
                    } else {
                        loadCycleIntoForm(state.cycles[0]);
                    }
                } else {
                    startNewCycle();
                }
                showStatus('Cycle deleted successfully.', 'success');
            })
            .catch(function (error) {
                console.error('Delete cycle error:', error);
                showStatus(error.message || 'Unable to delete the cycle.', 'error');
            });
    }

    function handleSetActiveCycle() {
        if (!state.currentCycleId || !state.cyclesMap[state.currentCycleId]) {
            showStatus('Please select a saved cycle first.', 'error');
            return;
        }

        showStatus('Updating default cycle...', null);
        sendRequest({ action: 'set_active', cycle_id: state.currentCycleId }, 'Unable to update the default cycle.')
            .then(function (data) {
                syncCycles(data.cycles, data.active_cycle_id);
                if (state.currentCycleId && state.cyclesMap[state.currentCycleId]) {
                    loadCycleIntoForm(state.cyclesMap[state.currentCycleId]);
                }
                showStatus('Default cycle updated.', 'success');
            })
            .catch(function (error) {
                console.error('Set active cycle error:', error);
                showStatus(error.message || 'Unable to update the default cycle.', 'error');
            });
    }

    function updateButtonsState() {
        const existing = !!(state.currentCycleId && state.cyclesMap[state.currentCycleId]);
        if (dom.deleteButton) {
            dom.deleteButton.disabled = !existing || state.cycles.length <= 1;
        }
        if (dom.setActiveButton) {
            dom.setActiveButton.disabled = !existing || (state.activeCycleId && state.currentCycleId === String(state.activeCycleId));
        }
    }

    function sendRequest(payload, defaultError) {
        return fetch('documents_life_cycle_settings_api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(function (response) {
            return parseJsonResponse(response, defaultError || 'Unable to process the request.');
        });
    }

    function parseJsonResponse(response, defaultError) {
        if (!response.ok) {
            return response.json().catch(function () {
                return {};
            }).then(function (body) {
                const message = body && body.error ? body.error : (defaultError || 'An unexpected error occurred.');
                throw new Error(message);
            });
        }
        return response.json();
    }

    function showStatus(message, type) {
        if (!dom.status) {
            return;
        }
        dom.status.textContent = message || '';
        dom.status.classList.remove('is-success', 'is-error');
        if (!message) {
            return;
        }
        if (type === 'success') {
            dom.status.classList.add('is-success');
        } else if (type === 'error') {
            dom.status.classList.add('is-error');
        }
    }

    init();
})();





