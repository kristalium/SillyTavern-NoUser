/**
 * SillyTavern extension: Mask User Role
 *
 * Rewrites user-role messages in the final Chat Completion prompt to
 * assistant-role messages. The persisted chat is never modified.
 */
(() => {
    'use strict';

    const EXTENSION_KEY = 'MaskUserRole';
    const DEFAULTS = { enabled: false, mode: 'marker_first' };
    const MODES = Object.freeze({
        MARKER_FIRST: 'marker_first',
        REWRITE_ALL: 'rewrite_all',
        MARKER_LAST: 'marker_last',
        KEEP_LAST_USER: 'keep_last_user',
    });
    const MARKER = '[user-role compatibility marker]';

    function context() {
        return SillyTavern.getContext();
    }

    function settings() {
        const ctx = context();
        ctx.extensionSettings ??= {};
        ctx.extensionSettings[EXTENSION_KEY] ??= { ...DEFAULTS };
        const value = ctx.extensionSettings[EXTENSION_KEY];
        if (!Object.values(MODES).includes(value.mode)) value.mode = DEFAULTS.mode;
        return value;
    }

    function saveSettings() {
        context().saveSettingsDebounced?.();
    }

    function mask(data) {
        const s = settings();
        if (!s.enabled || !data || typeof data !== 'object') return;

        // CHAT_COMPLETION_PROMPT_READY supplies the final chat-completion
        // message array. This is deliberately later than GENERATE_AFTER_DATA,
        // so Prompt Inspector and the provider see the same rewritten roles.
        const messages = Array.isArray(data.chat) ? data.chat : null;
        if (!messages || !messages.every(m => m && typeof m === 'object')) return;

        const users = messages.filter(m => m.role === 'user');
        if (!users.length) return;

        if (s.mode === MODES.MARKER_FIRST) {
            messages.unshift({ role: 'user', content: MARKER });
        }

        const preserved = s.mode === MODES.KEEP_LAST_USER ? users[users.length - 1] : null;
        for (const message of users) {
            if (message !== preserved) message.role = 'assistant';
        }

        if (s.mode === MODES.MARKER_LAST) {
            messages.push({ role: 'user', content: MARKER });
        }
    }

    function buildUI() {
        const s = settings();
        const root = document.createElement('div');
        root.id = 'mask-user-role-settings';
        root.className = 'inline-drawer extension_settings';
        root.innerHTML = `
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Mask User Role</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label" for="mask-user-role-enabled">
                    <input type="checkbox" id="mask-user-role-enabled">
                    <span>
                        <b>Mask User Role</b>
                        <small class="display_block">
                            Send your turns as the AI's words so the model quits handing your character plot armor.
                        </small>
                    </span>
                </label>
                <div style="margin-top:8px;">
                    <label for="mask-user-role-mode">Compatibility mode</label>
                    <small class="display_block">
                        Some providers reject a request with no user message, so the marker modes add one throwaway user line.
                    </small>
                    <select id="mask-user-role-mode" class="text_pole" style="margin-top:5px;">
                        <option value="marker_first">Marker first (for APIs that need a user message)</option>
                        <option value="rewrite_all">No marker: every turn becomes the AI</option>
                        <option value="marker_last">Marker last (for APIs that need a user message)</option>
                        <option value="keep_last_user">Keep my final message as user</option>
                    </select>
                </div>
            </div>`;

        const container = document.querySelector('#extensions_settings2');
        if (!container) return;
        container.appendChild(root);

        const checkbox = root.querySelector('#mask-user-role-enabled');
        const select = root.querySelector('#mask-user-role-mode');
        checkbox.checked = Boolean(s.enabled);
        select.value = s.mode;
        select.disabled = !s.enabled;

        checkbox.addEventListener('change', () => {
            s.enabled = checkbox.checked;
            select.disabled = !s.enabled;
            saveSettings();
        });
        select.addEventListener('change', () => {
            s.mode = select.value;
            saveSettings();
        });
    }

    function init() {
        const ctx = context();
        const { eventSource, event_types: eventTypes } = ctx;
        if (!eventSource || !eventTypes?.CHAT_COMPLETION_PROMPT_READY) {
            console.error('[Mask User Role] CHAT_COMPLETION_PROMPT_READY is unavailable.');
            return;
        }

        settings();
        buildUI();
        eventSource.on(eventTypes.CHAT_COMPLETION_PROMPT_READY, data => {
            if (data?.dryRun) return;
            try {
                mask(data);
            } catch (error) {
                console.error('[Mask User Role] Failed to rewrite prompt:', error);
            }
        });
        console.log('[Mask User Role] loaded.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
