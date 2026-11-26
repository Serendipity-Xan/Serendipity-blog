(function () {
    const dialog = document.getElementById('ag-cmdk');
    const input = document.getElementById('ag-cmdk-input');
    const list = document.getElementById('ag-cmdk-list');
    const data = document.getElementById('ag-cmdk-data');
    if (!dialog?.showModal || !input || !list || !data) return;

    const panel = dialog.querySelector('.ag-cmdk-panel');
    const close = document.createElement('button');
    close.className = 'ag-spotlight-close';
    close.type = 'button';
    close.setAttribute('aria-label', '关闭快速跳转');
    close.textContent = '×';

    const field = document.createElement('div');
    field.className = 'ag-spotlight-field';
    input.before(field);
    field.append(input, close);
    input.placeholder = '搜索文章、标签或指令…';
    input.setAttribute('aria-label', '搜索文章、标签或指令');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '快速跳转结果');

    const announcement = document.createElement('span');
    announcement.className = 'ag-spotlight-sr';
    announcement.setAttribute('role', 'status');
    panel.append(announcement);

    const fold = (value) => value.normalize('NFKC').toLocaleLowerCase();

    // Index the server-rendered public entries once. Keep navigation within the site.
    const sections = [];
    const seen = new Set();
    for (const anchor of data.querySelectorAll('[data-title][data-url]')) {
        const { title, kind, tags, meta } = anchor.dataset;
        let url;
        try { url = new URL(anchor.dataset.url, location.href); } catch { continue; }
        if (url.origin !== location.origin || seen.has(url.href)) continue;
        seen.add(url.href);
        const search = fold([title, kind, meta, tags].join(' '));
        sections.push({ title, kind, meta, url, search, icon: kind === '文章' ? '文' : kind === '页面' ? '页' : '↗' });
    }

    const articles = sections.filter(item => item.kind === '文章');
    const shuffle = {
        title: '随机漫游一篇文章', kind: '指令', icon: '✧', tags: 'random shuffle 随机 漫游',
        run() {
            const alternatives = articles.filter(item => item.url.pathname !== location.pathname);
            const pool = alternatives.length ? alternatives : articles;
            if (pool.length) location.assign(pool[Math.floor(Math.random() * pool.length)].url.href);
        }
    };
    const appearance = {
        kind: '外观', icon: '◐', tags: 'effects appearance 设置 外观 开关 动效 特效 开启 关闭',
        run() { document.dispatchEvent(new Event('ag:toggle-appearance-effects')); }
    };

    let appearanceEnabled = window.__AG_SITE_CONFIG__?.effects?.enabled !== false;
    try {
        const preferences = JSON.parse(localStorage.getItem('ag-effects-v1'));
        if (typeof preferences?.enabled === 'boolean') appearanceEnabled = preferences.enabled;
    } catch {}
    let visible = [];
    let active = -1;
    let opener = null;

    function updateAppearanceLabel() {
        appearance.title = appearanceEnabled ? '关闭视觉特效' : '开启视觉特效';
    }
    updateAppearanceLabel();

    document.addEventListener('ag:appearance', (event) => {
        if (typeof event.detail?.enabled !== 'boolean') return;
        appearanceEnabled = event.detail.enabled;
        updateAppearanceLabel();
        if (dialog.open) render();
    });

    function setActive(index, scroll = false) {
        active = index;
        Array.from(list.children).forEach((row, position) => {
            if (!row.id) return;
            const selected = position === active;
            row.classList.toggle('is-active', selected);
            row.setAttribute('aria-selected', String(selected));
        });
        const row = list.children[active];
        if (row?.id) {
            input.setAttribute('aria-activedescendant', row.id);
            if (scroll) row.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    }

    function render() {
        const query = fold(input.value.trim()).split(/\s+/).filter(Boolean);
        const options = articles.length ? [shuffle, appearance, ...sections] : [appearance, ...sections];
        visible = options.filter(item => {
            const haystack = item.search ?? fold([item.title, item.kind, item.tags].join(' '));
            return query.every(word => haystack.includes(word));
        }).slice(0, 12);

        list.replaceChildren();
        for (const [index, item] of visible.entries()) {
            const row = document.createElement('li');
            row.className = 'ag-cmdk-item';
            row.id = 'ag-spotlight-result-' + index;
            row.dataset.index = String(index);
            row.setAttribute('role', 'option');

            const icon = document.createElement('span');
            icon.className = 'ag-cmdk-ico';
            icon.textContent = item.icon;
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.className = 'ag-spotlight-result';
            label.textContent = item.title;
            const meta = document.createElement('span');
            meta.className = 'ag-cmdk-kind';
            meta.textContent = item.kind + (item.meta ? ' · ' + item.meta : '');
            row.append(icon, label, meta);
            list.append(row);
        }

        if (visible.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'ag-cmdk-empty';
            empty.setAttribute('role', 'presentation');
            empty.textContent = '没有找到匹配的内容';
            list.append(empty);
        }
        announcement.textContent = visible.length ? `显示 ${visible.length} 条结果` : '没有找到匹配的内容';
        setActive(visible.length ? 0 : -1);
        list.scrollTop = 0;
    }

    function open(trigger = document.activeElement) {
        if (dialog.open || document.querySelector('dialog[open]')) return;
        opener = trigger;
        input.value = '';
        render();
        dialog.showModal();
        input.setAttribute('aria-expanded', 'true');
        input.focus({ preventScroll: true });
    }

    function choose(index) {
        const item = visible[index];
        if (!item) return;
        dialog.close();
        if (item.run) item.run();
        else location.assign(item.url.href);
    }

    for (const button of document.querySelectorAll('[data-cmdk-open]')) {
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-controls', dialog.id);
        button.addEventListener('click', () => open(button));
    }

    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
        opener = null;
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229 || !visible.length) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setActive((active + direction + visible.length) % visible.length, true);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(active);
        }
    });
    list.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'mouse') return;
        const row = event.target.closest('[data-index]');
        if (row && Number(row.dataset.index) !== active) setActive(Number(row.dataset.index));
    }, { passive: true });
    list.addEventListener('click', (event) => {
        const row = event.target.closest('[data-index]');
        if (row) choose(Number(row.dataset.index));
    });

    document.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.shiftKey) return;
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
        if (!dialog.open && document.querySelector('dialog[open]')) return;
        event.preventDefault();
        if (dialog.open) dialog.close();
        else open();
    });
})();
