/**
 * Mask User Role for SillyTavern.
 *
 * Flips `is_user` on the ephemeral generation copy of the chat, so SillyTavern's
 * own prompt builder labels your turns as assistant turns. The saved chat is
 * never modified.
 */
(() => {
    'use strict';

    const KEY = 'MaskUserRole';
    const DEFAULTS = Object.freeze({
        enabled: false,
        mode: 'marker_first',
        renameToCharacter: true,
        debug: false,
    });
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
        ctx.extensionSettings[KEY] ??= {};
        const s = ctx.extensionSettings[KEY];
        for (const [k, v] of Object.entries(DEFAULTS)) {
            if (s[k] === undefined) s[k] = v;
        }
        if (!Object.values(MODES).includes(s.mode)) s.mode = DEFAULTS.mode;
        return s;
    }

    function saveSettings() {
        getContext().saveSettingsDebounced?.();
    }

    /**
     * Called by SillyTavern (via manifest.generate_interceptor) before prompt
     * assembly. `chat` is a copy made for this generation, so mutating it does
     * not alter the saved conversation.
     *
     * Message shape: { name, is_user, is_system, mes, send_date, ... }
     */
    globalThis.MaskUserRole_interceptGeneration = async function (chat, _contextSize, _abort, _type) {
        const s = getSettings();
        if (!s.enabled || !Array.isArray(chat)) return;

        if (s.debug) console.log('[Mask User Role] first message before:', structuredClone(chat[0]), 'type:', _type);

        const ctx = getContext();
        const users = chat.filter(m => m && m.is_user && !m.is_system);
        if (users.length === 0) return;

        const makeMarker = () => ({
            name: ctx.name1 ?? 'User',
            is_user: true,
            is_system: false,
            mes: MARKER,
            send_date: Date.now(),
            extra: {},
        });

        if (s.mode === MODES.MARKER_FIRST) {
            chat.unshift(makeMarker());
        }

        const preserved = s.mode === MODES.KEEP_LAST_USER ? users[users.length - 1] : null;

        for (const message of users) {
            if (message === preserved) continue;
            message.is_user = false;
            // Keep a name present, but make it the character's, so name-prefixing
            // (instruct sequences / "character names" setting) doesn't leak the persona.
            if (s.renameToCharacter && ctx.name2) message.name = ctx.name2;
        }

        if (s.mode === MODES.MARKER_LAST) {
            chat.push(makeMarker());
        }

        if (s.debug) console.log('[Mask User Role] chat after:', structuredClone(chat));
    };

    function buildUI() {
        const s = getSettings();
        const container = document.querySelector('#extensions_settings2');
        if (!container || document.getElementById('mask-user-role-settings')) return;

        const root = document.createElement('div');
        root.id = 'mask-user-role-settings';
        root.className = 'inline-drawer extension_settings';
        root.innerHTML = `
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Mask User Role</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label" for="mask-user-role-enabled">
                    <input type="checkbox" id="mask-user-role-enabled">
                    <span>
                        <b>Enable</b>
                        <small class="display_block">Send your turns as the AI's own words.</small>
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
                <label class="checkbox_label" for="mask-user-role-rename" style="margin-top:8px;">
                    <input type="checkbox" id="mask-user-role-rename">
                    <span>
                        <b>Rename masked turns to the character</b>
                        <small class="display_block">Prevents "Persona: ..." name prefixes from revealing the source.</small>
                    </span>
                </label>
                <label class="checkbox_label" for="mask-user-role-debug" style="margin-top:8px;">
                    <input type="checkbox" id="mask-user-role-debug">
                    <span>
                        <b>Debug logging</b>
                        <small class="display_block">Logs the chat array before/after masking to the browser console.</small>
                    </span>
                </label>
            </div>`;
        container.appendChild(root);

        const enabled = root.querySelector('#mask-user-role-enabled');
        const mode = root.querySelector('#mask-user-role-mode');
        const rename = root.querySelector('#mask-user-role-rename');
        const debug = root.querySelector('#mask-user-role-debug');

        enabled.checked = Boolean(s.enabled);
        mode.value = s.mode;
        mode.disabled = !s.enabled;
        rename.checked = Boolean(s.renameToCharacter);
        debug.checked = Boolean(s.debug);

        enabled.addEventListener('change', () => {
            s.enabled = enabled.checked;
            mode.disabled = !s.enabled;
            saveSettings();
        });
        mode.addEventListener('change', () => { s.mode = mode.value; saveSettings(); });
        rename.addEventListener('change', () => { s.renameToCharacter = rename.checked; saveSettings(); });
        debug.addEventListener('change', () => { s.debug = debug.checked; saveSettings(); });
    }

    function init() {
        const s = getSettings();
        buildUI();
        console.log('[Mask User Role] loaded;', s.enabled ? 'enabled' : 'disabled');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
