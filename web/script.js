(() => {
    // ==========================================================
    // Configuration & État Interne
    // ==========================================================
    const STORAGE_KEY = 'shl_tts_soundpad';
    const POS_STORAGE_KEY = 'shl_tts_panel_pos';
    const LOCK_STORAGE_KEY = 'shl_tts_panel_locked';

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let currentAudioSource = null;
    let previousTtsText = '';
    let editingPresetIndex = -1;
    let cooldownTimerInterval = null;
    let isTtsOnCooldown = false;

    // ==========================================================
    // Gestion du Stockage Local (LocalStorage)
    // ==========================================================
    const Storage = {
        loadPresets: () => {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) return JSON.parse(raw);
            } catch (e) { }
            return [
                { label: 'Bonjour', text: 'Bonjour!' },
                { label: 'Au revoir', text: 'Au revoir!' },
                { label: 'Aide', text: "A l'aide!" },
            ];
        },
        savePresets: (presets) => {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(presets)); } catch (e) { }
        },
        loadPanelPosition: () => {
            try {
                const raw = localStorage.getItem(POS_STORAGE_KEY);
                if (raw) return JSON.parse(raw);
            } catch (e) { }
            return null;
        },
        savePanelPosition: (x, y) => {
            try { localStorage.setItem(POS_STORAGE_KEY, JSON.stringify({ x, y })); } catch (e) { }
        },
        loadLockState: () => {
            try { return localStorage.getItem(LOCK_STORAGE_KEY) === 'true'; } catch (e) { }
            return false;
        },
        saveLockState: (val) => {
            try { localStorage.setItem(LOCK_STORAGE_KEY, val ? 'true' : 'false'); } catch (e) { }
        }
    };

    // ==========================================================
    // Moteur Audio (Web Audio API)
    // ==========================================================
    function stopAudioPlayback() {
        if (currentAudioSource) {
            try { currentAudioSource.stop(); } catch (e) { }
            currentAudioSource = null;
        }
    }

    async function playAudioFromBase64(base64Data, volumeLevel) {
        try {
            stopAudioPlayback();

            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }

            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;

            const gainNode = audioCtx.createGain();
            gainNode.gain.value = Math.min(1.0, Math.max(0.0, volumeLevel || 1.0));

            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            source.start(0);

            currentAudioSource = source;
            source.onended = () => {
                currentAudioSource = null;
                fetch(`https://${GetParentResourceName()}/audioEnded`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                }).catch(() => { });
            };
        } catch (err) {
            console.error('[shl_tts] Erreur lecture audio:', err.message || err);
        }
    }

    // ==========================================================
    // Interface Utlisateur (Mouvement et Verrouillage)
    // ==========================================================
    const uiPanel = document.getElementById('tts-panel');
    const dragHandle = document.getElementById('drag-handle');
    const lockButton = document.getElementById('btn-lock');

    let isPanelLocked = Storage.loadLockState();
    let isDraggingPanel = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    function applyLockState() {
        lockButton.textContent = isPanelLocked ? '🔒' : '🔓';
        lockButton.classList.toggle('is-locked', isPanelLocked);
        dragHandle.classList.toggle('locked', isPanelLocked);
    }

    function applyPanelPosition() {
        const savedPos = Storage.loadPanelPosition();
        const getPanelWidth = () => uiPanel.offsetWidth || 450;
        const getPanelHeight = () => uiPanel.offsetHeight || 420;
        if (savedPos) {
            const maxX = window.innerWidth - getPanelWidth();
            const maxY = window.innerHeight - 100;
            uiPanel.style.left = Math.min(Math.max(0, savedPos.x), maxX) + 'px';
            uiPanel.style.top = Math.min(Math.max(0, savedPos.y), maxY) + 'px';
        } else {
            uiPanel.style.left = ((window.innerWidth - getPanelWidth()) / 2) + 'px';
            uiPanel.style.top = ((window.innerHeight - getPanelHeight()) / 2) + 'px';
        }
    }

    applyLockState();

    lockButton.addEventListener('click', (e) => {
        e.stopPropagation();
        isPanelLocked = !isPanelLocked;
        Storage.saveLockState(isPanelLocked);
        applyLockState();
    });

    dragHandle.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || isPanelLocked) return;

        isDraggingPanel = true;
        dragHandle.classList.add('dragging');

        const rect = uiPanel.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingPanel) return;

        let newX = e.clientX - dragOffsetX;
        let newY = e.clientY - dragOffsetY;

        const maxX = window.innerWidth - uiPanel.offsetWidth;
        const maxY = window.innerHeight - uiPanel.offsetHeight;

        newX = Math.min(Math.max(0, newX), maxX);
        newY = Math.min(Math.max(0, newY), maxY);

        uiPanel.style.left = newX + 'px';
        uiPanel.style.top = newY + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isDraggingPanel) return;
        isDraggingPanel = false;
        dragHandle.classList.remove('dragging');

        const rect = uiPanel.getBoundingClientRect();
        Storage.savePanelPosition(rect.left, rect.top);
    });

    // ==========================================================
    // Communication Focus (LUA <-> JS)
    // ==========================================================
    const sendFocusEvent = (endpoint) => {
        fetch(`https://${GetParentResourceName()}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        }).catch(() => { });
    };

    function hookFocusEvents(element) {
        element.addEventListener('focus', () => sendFocusEvent('blockGameInput'));
        element.addEventListener('blur', () => sendFocusEvent('unblockGameInput'));
    }

    // ==========================================================
    // Gestion du Cooldown
    // ==========================================================
    const cooldownBarHtml = document.getElementById('cooldown-bar');
    const cooldownFillHtml = document.getElementById('cooldown-fill');
    const cooldownTextHtml = document.getElementById('cooldown-text');
    const sendButton = document.getElementById('btn-send');

    function startCooldownTimer(totalMs) {
        if (cooldownTimerInterval) clearInterval(cooldownTimerInterval);

        isTtsOnCooldown = true;
        sendButton.classList.add('on-cooldown');
        cooldownBarHtml.classList.remove('hidden');

        const startTime = Date.now();
        const endTime = startTime + totalMs;

        const tick = () => {
            const now = Date.now();
            const remaining = Math.max(0, endTime - now);
            const percent = (remaining / totalMs) * 100;

            cooldownFillHtml.style.width = percent + '%';
            cooldownTextHtml.textContent = (remaining / 1000).toFixed(1) + 's';

            if (remaining <= 0) {
                clearInterval(cooldownTimerInterval);
                cooldownTimerInterval = null;
                isTtsOnCooldown = false;
                cooldownBarHtml.classList.add('hidden');
                sendButton.classList.remove('on-cooldown');
            }
        };

        tick();
        cooldownTimerInterval = setInterval(tick, 50);
    }

    // ==========================================================
    // Paramètres Vocaux (PMA-Voice)
    // ==========================================================
    const voiceModeNameHtml = document.getElementById('voice-mode-name');
    const voiceModeRangeHtml = document.getElementById('voice-mode-range');
    const voiceRangeButton = document.getElementById('btn-voice-range');

    function updateVoiceInterface(mode, range) {
        voiceModeNameHtml.textContent = mode || 'Normal';
        voiceModeRangeHtml.textContent = (range || 7) + 'm';
    }

    voiceRangeButton.addEventListener('click', () => {
        sendFocusEvent('cycleVoice');
    });

    // ==========================================================
    // Gestion du Panneau principal TTS
    // ==========================================================
    const ttsInputArea = document.getElementById('tts-input');
    const charCountHtml = document.getElementById('char-count');
    const stopButton = document.getElementById('btn-stop');
    const previousButton = document.getElementById('btn-previous');
    const closeButton = document.getElementById('btn-close');

    ttsInputArea.addEventListener('input', () => {
        charCountHtml.textContent = ttsInputArea.value.length;
    });

    hookFocusEvents(ttsInputArea);

    sendButton.addEventListener('click', () => {
        if (isTtsOnCooldown) return;
        const text = ttsInputArea.value.trim();
        if (!text) return;

        previousTtsText = text;
        ttsInputArea.value = '';
        charCountHtml.textContent = '0';

        fetch(`https://${GetParentResourceName()}/sendTTS`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        }).catch(() => { });
    });

    stopButton.addEventListener('click', () => {
        stopAudioPlayback();
        sendFocusEvent('stopTTS');
    });

    previousButton.addEventListener('click', () => {
        if (previousTtsText) {
            ttsInputArea.value = previousTtsText;
            charCountHtml.textContent = previousTtsText.length.toString();
            ttsInputArea.focus();
        }
    });

    closeButton.addEventListener('click', () => {
        closeTtsPanel();
    });

    ttsInputArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendButton.click();
        }
    });

    function closeTtsPanel() {
        uiPanel.classList.add('hidden');
        closePresetModal();
        sendFocusEvent('closePanel');
    }

    // ==========================================================
    // Grille de Boutons (Soundpad)
    // ==========================================================
    const addPresetButton = document.getElementById('btn-add-preset');

    function escapeHtmlString(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function renderSoundpadGrid() {
        const grid = document.getElementById('soundpad-grid');
        grid.innerHTML = '';
        const presets = Storage.loadPresets();

        if (presets.length === 0) {
            const msg = document.createElement('div');
            msg.className = 'soundpad-empty-msg';
            msg.textContent = 'Aucun preset — cliquez sur "+ Ajouter"';
            grid.appendChild(msg);
            return;
        }

        presets.forEach((preset, i) => {
            const btn = document.createElement('div');
            btn.className = 'soundpad-btn';
            btn.innerHTML = `
                <button class="soundpad-btn-edit" data-index="${i}" title="Modifier">✎</button>
                <span class="soundpad-btn-label">${escapeHtmlString(preset.label)}</span>
                <span class="soundpad-btn-text">${escapeHtmlString(preset.text)}</span>
            `;

            btn.addEventListener('click', (e) => {
                if (e.target.classList.contains('soundpad-btn-edit')) return;
                if (isTtsOnCooldown) return;

                previousTtsText = preset.text;
                fetch(`https://${GetParentResourceName()}/sendTTS`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: preset.text })
                }).catch(() => { });
            });

            btn.querySelector('.soundpad-btn-edit').addEventListener('click', (e) => {
                e.stopPropagation();
                openPresetModal(i);
            });

            grid.appendChild(btn);
        });
    }

    addPresetButton.addEventListener('click', () => {
        openPresetModal(-1);
    });

    // ==========================================================
    // Modal d'Édition de Preset
    // ==========================================================
    const presetModal = document.getElementById('preset-modal');
    const modalTitleHtml = document.getElementById('modal-title');
    const presetLabelInput = document.getElementById('preset-label');
    const presetTextInput = document.getElementById('preset-text');
    const modalDeleteBtn = document.getElementById('modal-delete');
    const modalSaveBtn = document.getElementById('modal-save');
    const modalCancelBtn = document.getElementById('modal-cancel');
    const modalCloseBtn = document.getElementById('modal-close');

    hookFocusEvents(presetLabelInput);
    hookFocusEvents(presetTextInput);

    function openPresetModal(index) {
        editingPresetIndex = index;
        const presets = Storage.loadPresets();

        if (index >= 0 && index < presets.length) {
            modalTitleHtml.textContent = 'Modifier le preset';
            presetLabelInput.value = presets[index].label;
            presetTextInput.value = presets[index].text;
            modalDeleteBtn.classList.remove('hidden');
        } else {
            modalTitleHtml.textContent = 'Nouveau preset';
            presetLabelInput.value = '';
            presetTextInput.value = '';
            modalDeleteBtn.classList.add('hidden');
        }

        presetModal.classList.remove('hidden');
        presetLabelInput.focus();
    }

    function closePresetModal() {
        presetModal.classList.add('hidden');
        editingPresetIndex = -1;
    }

    modalSaveBtn.addEventListener('click', () => {
        const label = presetLabelInput.value.trim();
        const text = presetTextInput.value.trim();
        if (!label || !text) return;

        const presets = Storage.loadPresets();

        if (editingPresetIndex >= 0 && editingPresetIndex < presets.length) {
            presets[editingPresetIndex] = { label, text };
        } else {
            presets.push({ label, text });
        }

        Storage.savePresets(presets);
        renderSoundpadGrid();
        closePresetModal();
    });

    modalDeleteBtn.addEventListener('click', () => {
        if (editingPresetIndex < 0) return;
        const presets = Storage.loadPresets();
        presets.splice(editingPresetIndex, 1);
        Storage.savePresets(presets);
        renderSoundpadGrid();
        closePresetModal();
    });

    modalCancelBtn.addEventListener('click', closePresetModal);
    modalCloseBtn.addEventListener('click', closePresetModal);

    presetLabelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            presetTextInput.focus();
        }
    });

    // Capture de la touche Echap pour fermer les menus
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Escape') {
            if (!presetModal.classList.contains('hidden')) {
                closePresetModal();
            } else {
                closeTtsPanel();
            }
        }
    });

    // ==========================================================
    // Écouteur Principal (Événements NUI / Lua -> JS)
    // ==========================================================
    window.addEventListener('message', async (event) => {
        const data = event.data;

        switch (data.type) {
            case 'openPanel':
                updateVoiceInterface(data.voiceMode, data.voiceRange);
                applyPanelPosition();
                renderSoundpadGrid();
                uiPanel.classList.remove('hidden');
                break;
            case 'closePanel':
                uiPanel.classList.add('hidden');
                closePresetModal();
                break;
            case 'voiceUpdate':
                updateVoiceInterface(data.voiceMode, data.voiceRange);
                break;
            case 'cooldownStart':
                startCooldownTimer(data.total);
                break;
            case 'cooldownUpdate':
                startCooldownTimer(data.remaining);
                break;
            case 'stopAudio':
                stopAudioPlayback();
                break;
            case 'playAudio':
                if (data.audio) {
                    await playAudioFromBase64(data.audio, data.volume);
                }
                break;
        }
    });

})();
