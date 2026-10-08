/**
 * Mask User Role for SillyTavern.
 *
 * Changes user turns only in SillyTavern's ephemeral generation chat.
 * The saved chat is never modified.
 */
(() => {
    'use strict';

    const KEY = 'MaskUserRole';
    const DEFAULTS = Object.freeze({ enabled: false, mode: 'marker_first' });
    const MODES = Object.freeze({
        MARKER_FIRST: 'marker_first',
        REWRITE_ALL: 'rewrite_all',
        MARKER_LAST: 'marker_last',
        KEEP_LAST_USER: 'keep_last_user',
    });
    const MARKER = '[user-role compatibility marker]';

    function getContext() {
        return SillyTavern.getContext();
    }

    function getSettings() {
        const ctx = getContext();
        ctx.extensionSettings ??= {};
        ctx.extensionSettings[KEY] ??= { ...DEFAULTS };
        const s = ctx.extensionSettings[KEY];
        if (!Object.values(MODES).includes(s.mode)) s.mode = DEFAULTS.mode;
        return s;
    }

    function saveSettings() {
        getContext().saveSettingsDebounced?.();
    }

    /**
     * SillyTavern calls this through manifest.generate_interceptor before
     * prompt assembly. `chat` is an ephemeral generation copy, so mutating it
     * does not alter the actual saved conversation.
     */
    globalThis.MaskUserRole_interceptGeneration = async function (chat, _contextSize, _abort, _type) {
        const s = getSettings();
        if (!s.enabled || !Array.isArray(chat)) return;

        const users = chat.filter(message => message && message.role === 'user');
        if (users.length === 0) return;

        if (s.mode === MODES.MARKER_FIRST) {
            chat.unshift({ role: 'user', content: MARKER });
        }

        const preserved = s.mode === MODES.KEEP_LAST_USER ? users[users.length - 1] : null;

        for (const message of users) {
            if (message === preserved) continue;
            message.role = 'assistant';

            // A `name` such as the persona/user name can otherwise still make
            // the message look like it came from the user to some backends.
            delete message.name;
        }

        if (s.mode === MODES.MARKER_LAST) {
            chat.push({ role: 'user', content: MARKER });
        }
    };

    function buildUI() {
        const s = getSettings();
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
                        <small class="display_block">Send your turns as the AI's words so the model quits handing your character plot armor.</small>
                    </span>
                </label>
                <div style="margin-top:8px;">
                    <label for="mask-user-role-mode">Compatibility mode</label>
                    <small class="display_block">Some providers reject a request with no user message, so the marker modes add one throwaway user line.</small>
                    <select id="mask-user-role-mode" class="text_pole" style="margin-top:5px;">
                        <option value="marker_first">Marker first</option>
                        <option value="rewrite_all">No marker: every turn becomes the AI</option>
                        <option value="marker_last">Marker last</option>
                        <option value="keep_last_user">Keep final user message</option>
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
        const s = getSettings();
        buildUI();
        console.log('[Mask User Role] loaded; interceptor ready.', s.enabled ? '(enabled)' : '(disabled)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
