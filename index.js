/**
 * SillyTavern extension: Mask User Role
 *
 * Rewrites outgoing user-role chat messages to assistant-role messages
 * immediately before generation. The persisted chat is never modified.
 */
(() => {
    'use strict';

    const EXTENSION_KEY = 'MaskUserRole';
    const DEFAULTS = {
        enabled: false,
        mode: 'marker_first',
    };

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
        ctx.extensionSettings[EXTENSION_KEY] ??= { ...DEFAULTS };

        const settings = ctx.extensionSettings[EXTENSION_KEY];
        if (!Object.values(MODES).includes(settings.mode)) {
            settings.mode = DEFAULTS.mode;
        }
        return settings;
    }

    function saveSettings() {
        getContext().saveSettingsDebounced?.();
    }

    function getMessages(generateData) {
        if (Array.isArray(generateData)) return generateData;

        if (!generateData || typeof generateData !== 'object') return null;

        if (Array.isArray(generateData.prompt)) return generateData.prompt;
        if (Array.isArray(generateData.messages)) return generateData.messages;

        return null;
    }

    function rewrite(generateData) {
        const settings = getSettings();
        if (!settings.enabled) return;

        const messages = getMessages(generateData);
        if (!messages || !messages.every(m => m && typeof m === 'object')) return;

        const users = messages.filter(m => m.role === 'user');
        if (!users.length) return;

        switch (settings.mode) {
            case MODES.MARKER_FIRST:
                messages.unshift({ role: 'user', content: MARKER });
                break;

            case MODES.MARKER_LAST:
                // Added after rewriting below.
                break;

            case MODES.KEEP_LAST_USER:
                // The final user message is intentionally preserved below.
                break;

            case MODES.REWRITE_ALL:
            default:
                break;
        }

        const preserved = settings.mode === MODES.KEEP_LAST_USER
            ? users[users.length - 1]
            : null;

        for (const message of users) {
            if (message !== preserved) {
                message.role = 'assistant';
            }
        }

        if (settings.mode === MODES.MARKER_LAST) {
            messages.push({ role: 'user', content: MARKER });
        }
    }

    function buildUI() {
        const settings = getSettings();

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

                <div id="mask-user-role-mode-row" style="margin-top: 8px;">
                    <label for="mask-user-role-mode">Compatibility mode</label>
                    <small class="display_block">
                        Some providers reject a request with no user message, so the marker modes add one throwaway user line.
                    </small>
                    <select id="mask-user-role-mode" class="text_pole" style="margin-top: 5px;">
                        <option value="marker_first">Marker first (for APIs that need a user message)</option>
                        <option value="rewrite_all">No marker: every turn becomes the AI</option>
                        <option value="marker_last">Marker last (for APIs that need a user message)</option>
                        <option value="keep_last_user">Keep my final message as user</option>
                    </select>
                </div>
            </div>
        `;

        const container = document.querySelector('#extensions_settings2');
        if (!container) return;

        container.appendChild(root);

        const checkbox = root.querySelector('#mask-user-role-enabled');
        const select = root.querySelector('#mask-user-role-mode');

        checkbox.checked = Boolean(settings.enabled);
        select.value = settings.mode;
        select.disabled = !settings.enabled;

        checkbox.addEventListener('change', () => {
            settings.enabled = checkbox.checked;
            select.disabled = !settings.enabled;
            saveSettings();
        });

        select.addEventListener('change', () => {
            settings.mode = select.value;
            saveSettings();
        });

        const header = root.querySelector('.inline-drawer-toggle');
        header.addEventListener('click', () => {
            root.classList.toggle('closedDrawer');
            root.querySelector('.inline-drawer-content').style.display =
                root.classList.contains('closedDrawer') ? 'none' : '';
        });
    }

    function init() {
        const ctx = getContext();
        const eventTypes = ctx.event_types;
        const eventSource = ctx.eventSource;

        if (!eventTypes?.GENERATE_AFTER_DATA || !eventSource) {
            console.error('[Mask User Role] SillyTavern GENERATE_AFTER_DATA is unavailable.');
            return;
        }

        getSettings();
        buildUI();

        eventSource.on(eventTypes.GENERATE_AFTER_DATA, (generateData, dryRun) => {
            // Match Summaryception's behavior: never alter dry-run/preview payloads.
            if (dryRun === true || generateData?.dryRun === true) return;

            try {
                rewrite(generateData);
            } catch (error) {
                console.error('[Mask User Role] Failed to rewrite generation payload:', error);
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
