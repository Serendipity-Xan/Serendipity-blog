const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const DUSK_KEY = 'ag-effects-dusk-day';
// 以访客设备本地时间判定黄昏。分开设定起止，方便调整显示窗口。
const DUSK_START = [17, 45];
const DUSK_END = [18, 30];
const DUSK_NOTE = '天色翻过一页，刚才那颗星还在原处。';

function localDate(now, time, dayOffset = 0) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, ...time);
}

function dateKey(now) {
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function createNotice() {
    const node = document.createElement('aside');
    node.className = 'ag-moment-notice';
    node.hidden = true;

    const text = document.createElement('p');
    text.setAttribute('role', 'status');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', '关闭提示');

    node.append(text, close);
    document.body.append(node);

    let timer = 0;
    let returnFocus = null;

    function hide() {
        window.clearTimeout(timer);
        if (node.contains(document.activeElement)) returnFocus?.focus({ preventScroll: true });
        node.hidden = true;
        returnFocus = null;
    }

    close.addEventListener('click', hide);

    return {
        show(message, duration, focusTarget = null) {
            window.clearTimeout(timer);
            returnFocus = focusTarget;
            node.hidden = false;
            text.textContent = message;
            timer = window.setTimeout(() => {
                if (!node.contains(document.activeElement)) hide();
            }, duration);
        },
        hide
    };
}

export function mountEasterEggs(settings) {
    const avatar = document.querySelector('.ag-avatar-button');
    const home = document.body.classList.contains('home-template');
    let enabled = false;
    let configured = false;
    let sequenceIndex = 0;
    let swapped = false;
    let duskTimer = 0;
    let lastDusk = '';
    let notice = null;

    function notify(message, duration, focusTarget) {
        notice ??= createNotice();
        notice.show(message, duration, focusTarget);
    }

    function setIdentity(next) {
        swapped = next;
        avatar?.toggleAttribute('data-ag-swapped', next);
        avatar?.setAttribute('aria-pressed', String(next));
    }

    avatar?.addEventListener('click', () => {
        if (!enabled) return;
        setIdentity(!swapped);
        notify(swapped ? '身体互换了。今晚借你一点月光。' : '换回来了。刚才的月光送给你。', 4600, avatar);
    });

    document.addEventListener('keydown', event => {
        if (!enabled || event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.target instanceof Element && event.target.closest('input, textarea, select, button, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')
            || document.querySelector('dialog[open], .ag-cmdk.is-open, .ag-lightbox.is-open')) {
            sequenceIndex = 0;
            return;
        }

        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (key !== KONAMI[sequenceIndex]) {
            sequenceIndex = key === KONAMI[0] ? 1 : 0;
            return;
        }
        sequenceIndex += 1;
        if (sequenceIndex < KONAMI.length) return;
        sequenceIndex = 0;
        document.dispatchEvent(new Event('ag:launch-comet'));
        notify('收到一封星光回信。', 4600);
    });

    function rememberDusk(key) {
        lastDusk = key;
        try { localStorage.setItem(DUSK_KEY, key); } catch {}
    }

    function hasSeenDusk(key) {
        if (lastDusk === key) return true;
        try { return localStorage.getItem(DUSK_KEY) === key; } catch { return false; }
    }

    function scheduleDusk() {
        window.clearTimeout(duskTimer);
        if (!home || !enabled) return;

        const now = new Date();
        const start = localDate(now, DUSK_START);
        const end = localDate(now, DUSK_END);
        const key = dateKey(now);
        if (now >= start && now < end && !hasSeenDusk(key)) {
            duskTimer = window.setTimeout(() => {
                const shownAt = new Date();
                if (!enabled || dateKey(shownAt) !== key || shownAt < start || shownAt >= end || hasSeenDusk(key)) {
                    scheduleDusk();
                    return;
                }
                if (!document.querySelector('.ag-cmdk.is-open, .ag-lightbox.is-open')) {
                    rememberDusk(key);
                    notify(DUSK_NOTE, 8000);
                    scheduleDusk();
                }
            }, 1600);
            return;
        }

        const next = now < start ? start : localDate(now, DUSK_START, 1);
        duskTimer = window.setTimeout(scheduleDusk, next - now);
    }

    window.addEventListener('pagehide', () => {
        window.clearTimeout(duskTimer);
        notice?.hide();
    });
    window.addEventListener('pageshow', event => {
        if (event.persisted) scheduleDusk();
    });

    settings.subscribe(policy => {
        configured = policy.configured && policy.easter;
        enabled = policy.enabled && policy.easter;
        if (avatar) {
            avatar.disabled = !configured;
            avatar.toggleAttribute('data-ag-avatar-motion', enabled);
        }
        if (!configured) setIdentity(false);
        if (!enabled) {
            sequenceIndex = 0;
            notice?.hide();
        }
        scheduleDusk();
    });
}
