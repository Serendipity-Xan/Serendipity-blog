const STORAGE_KEY = 'ag-effects-v1';
const DEFAULT_INTENSITY = 65;
const ATMOSPHERE_SCOPES = {
    scopeHome: '.home-template',
    scopeArchive: '.page-articles',
    scopeLife: '.page-life, .tag-template:is(.tag-travel, .tag-life, .tag-music)',
    scopeToolbox: '.page-toolbox',
    scopeAbout: '.page-about',
    scopePost: '.post-template'
};

function loadSavedPreferences() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved;
    } catch {
        // An unavailable or malformed store starts from the form defaults.
    }
    return {};
}

function controlValue(control) {
    if (control.type === 'checkbox') return control.checked;
    if (control.type === 'range') return control.valueAsNumber;
    return control.value;
}

function restoreValue(control, saved, fallback = controlValue(control)) {
    if (control.type === 'checkbox' && typeof saved === 'boolean') return saved;
    if (control.type === 'range' && Number.isFinite(saved)) {
        return Math.round(Math.max(Number(control.min), Math.min(Number(control.max), saved)));
    }
    if (control.tagName === 'SELECT' && Array.from(control.options).some(option => option.value === saved)) return saved;
    return fallback;
}

export function mountEffectsSettings() {
    const root = document.documentElement;
    const trigger = document.querySelector('.ag-appearance-trigger');
    const dialog = document.getElementById('ag-effects-settings');
    if (!trigger || typeof dialog?.showModal !== 'function') return null;

    const form = dialog.querySelector('form');
    const status = dialog.querySelector('[data-effects-status]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const heading = dialog.querySelector('[data-settings-heading]');
    const back = dialog.querySelector('[data-settings-back]');
    const views = dialog.querySelectorAll('[data-settings-view]');
    const categories = dialog.querySelectorAll('[data-settings-target]');
    const viewHistory = [];
    const menuTitle = heading.textContent;
    let activeCategory = null;

    function showCategory(category) {
        activeCategory = category;
        const viewName = category?.dataset.settingsTarget || 'menu';

        for (const view of views) {
            view.hidden = view.dataset.settingsView !== viewName;
        }
        heading.textContent = category?.querySelector('[data-settings-label]').textContent || menuTitle;
        back.hidden = !category;
        form.scrollTop = 0;
    }

    function returnToPreviousView() {
        const previous = viewHistory.pop();
        if (!previous) return;
        showCategory(previous.category);
        previous.opener.focus({ preventScroll: true });
    }

    // 浏览器未报告硬件信息时，仅按指针类型判断是否降级。
    const limited = (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)
        || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4)
        || Boolean(navigator.connection?.saveData);
    const listeners = new Set();
    const controls = Array.from(form.elements).filter(control => control.name);
    const siteDefaults = window.__AG_SITE_CONFIG__?.effects;
    const defaults = Object.fromEntries(controls.map(control => [control.name, restoreValue(control, siteDefaults?.[control.name])]));
    const pageScope = Object.entries(ATMOSPHERE_SCOPES).find(([, selector]) => document.body.matches(selector))?.[0];
    const saved = loadSavedPreferences();
    const frequencyOutput = form.querySelector('output[for="ag-effects-frequency"]');
    const sizeOutput = form.querySelector('output[for="ag-effects-size"]');
    const depthOutput = form.querySelector('output[for="ag-reading-depth"]');
    // The old intensity controls other effects at its previous level, independently of the two particle sliders.
    const legacyIntensity = Number.isFinite(saved.intensity) ? Math.max(0, Math.min(100, saved.intensity)) : null;
    let intensity = legacyIntensity || DEFAULT_INTENSITY;
    if (legacyIntensity === 0 && !Number.isFinite(saved.frequency) && !Number.isFinite(saved.size)) saved.enabled = false;
    if (legacyIntensity !== null) {
        if (!Number.isFinite(saved.frequency)) saved.frequency = legacyIntensity;
        if (!Number.isFinite(saved.size)) saved.size = legacyIntensity;
    }
    let preferences = Object.fromEntries(controls.map(control => [
        control.name, restoreValue(control, saved[control.name], defaults[control.name])
    ]));

    function readPolicy() {
        const configured = preferences.enabled && !reduced.matches;
        const visible = configured && !document.hidden;
        const frequency = preferences.frequency / 100;
        const size = preferences.size / 100;
        const atmosphere = preferences.particles && frequency > 0 && size > 0
            && (!pageScope || preferences[pageScope]) ? preferences.atmosphere : 'off';
        return {
            ...preferences,
            configured,
            enabled: visible && !dialog.open,
            intensity: intensity / 100,
            frequency,
            size,
            compact: coarse.matches || limited,
            coarse: coarse.matches,
            pearlMotion: preferences.prism || preferences.cardTilt,
            atmosphere,
            atmosphereEnabled: visible && atmosphere !== 'off'
        };
    }

    function publish() {
        const policy = readPolicy();
        root.toggleAttribute('data-ag-prism', policy.enabled && policy.prism && !policy.coarse);
        root.toggleAttribute('data-ag-card-tilt', policy.configured && policy.cardTilt && !policy.coarse);
        status.textContent = reduced.matches ? '系统已开启减少动态效果'
            : !preferences.enabled ? '动态特效已关闭'
                : policy.compact ? '轻量模式' : '动态特效已开启';
        listeners.forEach(listener => listener(policy));
        document.dispatchEvent(new CustomEvent('ag:appearance', { detail: { enabled: preferences.enabled } }));
    }

    function render() {
        delete document.documentElement.dataset.agTone;
        document.documentElement.style.removeProperty('--ag-scene-tone');
        for (const [key, value] of Object.entries(preferences)) {
            const control = form.elements.namedItem(key);
            if (!control) continue;
            if (control.type === 'checkbox') control.checked = value;
            else control.value = value;
        }
        frequencyOutput.value = `${preferences.frequency}%`;
        sizeOutput.value = `${preferences.size}%`;
        if (depthOutput && Number.isFinite(preferences.readingDepth)) {
            depthOutput.value = `${preferences.readingDepth}%`;
            document.documentElement.style.setProperty('--ag-reading-depth', (preferences.readingDepth / 100).toFixed(2));
        }
        publish();
    }

    function persist() {
        // Keep only overrides so future site defaults reach visitors who have changed another setting.
        const overrides = Object.fromEntries(Object.entries(preferences).filter(([key, value]) => value !== defaults[key]));
        if (intensity !== DEFAULT_INTENSITY) {
            overrides.intensity = intensity;
            overrides.frequency = preferences.frequency;
            overrides.size = preferences.size;
        }
        try {
            if (Object.keys(overrides).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
            else localStorage.removeItem(STORAGE_KEY);
        } catch {}
        render();
    }

    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('input', event => {
        const control = event.target;
        if (!Object.hasOwn(preferences, control.name)) return;
        preferences[control.name] = controlValue(control);
        persist();
    });
    dialog.querySelector('[data-effects-reset]').addEventListener('click', () => {
        preferences = { ...defaults };
        intensity = DEFAULT_INTENSITY;
        persist();
    });
    document.addEventListener('ag:toggle-appearance-effects', () => {
        preferences.enabled = !preferences.enabled;
        persist();
    });
    for (const category of categories) {
        category.addEventListener('click', () => {
            viewHistory.push({ category: activeCategory, opener: category });
            showCategory(category);
            heading.focus({ preventScroll: true });
        });
    }
    back.addEventListener('click', returnToPreviousView);
    trigger.addEventListener('click', event => {
        event.preventDefault();
        if (dialog.open) return;
        viewHistory.length = 0;
        showCategory(null);
        form.querySelectorAll('details[open]').forEach(details => { details.open = false; });
        dialog.showModal();
        categories[0].focus({ preventScroll: true });
        publish();
    });
    dialog.addEventListener('cancel', event => {
        if (!activeCategory) return;
        event.preventDefault();
        returnToPreviousView();
    });
    dialog.querySelector('[data-effects-close]').addEventListener('click', () => dialog.close());
    // 模态面板内保留原生键盘操作，避免全站快捷键打开背后的搜索框。
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('close', () => {
        trigger.focus({ preventScroll: true });
        publish();
    });
    document.addEventListener('visibilitychange', publish);
    reduced.addEventListener('change', publish);
    coarse.addEventListener('change', publish);

    render();

    return {
        subscribe(listener) {
            listeners.add(listener);
            listener(readPolicy());
            return () => listeners.delete(listener);
        }
    };
}
