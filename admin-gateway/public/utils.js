import { translateText } from './i18n.js';

export function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function escapeAttr(str) {
    return escapeHtml(str);
}

export function uid(prefix = 'item') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateShort(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTimeLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localDateTimeToIso(val) {
    if (!val) return null;
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

export function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function moveItem(arr, index, delta) {
    const next = index + delta;
    if (next < 0 || next >= arr.length) return false;
    const tmp = arr[index];
    arr[index] = arr[next];
    arr[next] = tmp;
    return true;
}

export function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        toast('已复制到剪贴板', 'success');
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            toast('已复制到剪贴板', 'success');
        } catch {
            toast('复制失败，请手动选中复制', 'error');
        }
        ta.remove();
    }
}

export function toast(message, type = 'info', duration = 3200) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '!' : type === 'warning' ? '⚠' : 'ℹ';
    el.innerHTML = `<span>${icon}</span><span>${escapeHtml(translateText(String(message ?? '')))}</span>`;
    root.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(6px)';
        el.style.transition = 'opacity 0.2s, transform 0.2s';
        setTimeout(() => el.remove(), 220);
    }, duration);
}

const modalStack = [];

function handleModalKeydown(e) {
    if (e.key === 'Escape' && modalStack.length > 0) {
        e.preventDefault();
        closeModal();
    }
}

export function closeModal(targetEntry = null) {
    if (modalStack.length === 0) return;
    const idx = targetEntry ? modalStack.indexOf(targetEntry) : modalStack.length - 1;
    if (idx === -1) return;

    const [entry] = modalStack.splice(idx, 1);
    if (!entry || entry.closed) return;
    entry.closed = true;

    entry.overlayEl?.remove();

    if (modalStack.length === 0) {
        window.removeEventListener('keydown', handleModalKeydown);
        const legacyRoot = document.getElementById('modal-root');
        if (legacyRoot) {
            legacyRoot.classList.add('hidden');
            legacyRoot.innerHTML = '';
        }
    }

    if (typeof entry.onClose === 'function') {
        entry.onClose();
    }
}

export function openModal({ title, bodyHtml = '', footerHtml = '', wide = false, onMount = null, onClose = null }) {
    const overlayEl = document.createElement('div');
    overlayEl.className = 'modal-root';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');
    overlayEl.style.zIndex = String(100 + modalStack.length * 10);
    overlayEl.innerHTML = `
        <div class="modal-dialog ${wide ? 'modal-wide' : ''}" role="document">
            <div class="modal-header">
                <h3>${escapeHtml(translateText(title))}</h3>
                <button type="button" class="icon-btn" data-modal-close aria-label="${escapeAttr(translateText('关闭'))}">✕</button>
            </div>
            <div class="modal-body">${bodyHtml}</div>
            ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
        </div>
    `;

    const entry = {
        overlayEl,
        onClose,
        closed: false
    };

    overlayEl.addEventListener('click', (e) => {
        if (e.target === overlayEl || e.target.closest('[data-modal-close]')) {
            closeModal(entry);
        }
    });

    if (modalStack.length === 0) {
        window.addEventListener('keydown', handleModalKeydown);
    }
    modalStack.push(entry);
    document.body.appendChild(overlayEl);

    const dialog = overlayEl.querySelector('.modal-dialog');
    if (typeof onMount === 'function') {
        onMount(dialog);
    }
    return {
        dialog,
        close: () => closeModal(entry)
    };
}

export function confirmModal({ title = '确认操作', message = '确定继续吗？', confirmText = '确认', cancelText = '取消', danger = false }) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (val) => {
            if (settled) return;
            settled = true;
            closeModal();
            resolve(val);
        };
        openModal({
            title,
            bodyHtml: `<p style="margin:0;color:var(--ink-secondary);line-height:1.7;">${escapeHtml(message)}</p>`,
            footerHtml: `
                <button type="button" class="btn" data-confirm-cancel>${escapeHtml(cancelText)}</button>
                <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok>${escapeHtml(confirmText)}</button>
            `,
            onMount(dialog) {
                dialog.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => finish(false));
                dialog.querySelector('[data-confirm-ok]')?.addEventListener('click', () => finish(true));
            },
            onClose() {
                if (!settled) {
                    settled = true;
                    resolve(false);
                }
            }
        });
    });
}

export function isImageUrl(val) {
    if (!val) return false;
    const s = String(val).trim();
    return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/') || s.startsWith('data:image/');
}

const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    posts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
    pages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    links: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    sections: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    appearance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18 2.5 2.5 0 0 0 0-5h1.5a2.5 2.5 0 0 0 0-5H12"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    members: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    comments: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    advanced: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>'
};

export function renderIconSvg(name) {
    return ICONS[name] || '';
}
