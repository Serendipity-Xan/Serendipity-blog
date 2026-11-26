// All optional scene effects share one frame. A client requests another frame only while it has work.
export function createEffectsFrames() {
    const pending = new Set();
    let frame = 0;
    let running = false;

    function schedule() {
        if (!frame && !running && pending.size && !document.hidden) frame = requestAnimationFrame(draw);
    }

    function draw(time) {
        frame = 0;
        running = true;
        try {
            for (const callback of Array.from(pending)) {
                if (pending.delete(callback)) callback(time);
            }
        } finally {
            running = false;
            schedule();
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) return;
        cancelAnimationFrame(frame);
        frame = 0;
        pending.clear();
    });

    return {
        request(callback) {
            if (document.hidden) return;
            pending.add(callback);
            schedule();
        },
        cancel(callback) {
            pending.delete(callback);
            if (!pending.size && frame) {
                cancelAnimationFrame(frame);
                frame = 0;
            }
        }
    };
}

function afterLoad(callback) {
    function queue() {
        if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout: 1000 });
        else setTimeout(callback, 0);
    }

    if (document.readyState === 'complete') queue();
    else window.addEventListener('load', queue, { once: true });
}

function loadStyle(url) {
    if (!url) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        link.onload = resolve;
        link.onerror = reject;
        document.head.append(link);
    });
}

export function mountOptionalEffects(settings, frames) {
    const registry = document.getElementById('ag-effects-modules');
    if (!registry) return;
    const modules = Array.from(registry.content.children, entry => entry.dataset)
        .filter(entry => !entry.page || document.querySelector(entry.page));
    const started = new Set();

    settings.subscribe(policy => {
        if (!policy.configured) return;
        for (const entry of modules) {
            const value = policy[entry.feature];
            if (!value || value === 'off' || started.has(entry) || (entry.fineOnly && policy.coarse)) continue;
            started.add(entry);
            afterLoad(() => {
                Promise.all([import(entry.source), loadStyle(entry.style)])
                    .then(([module]) => module[entry.mount](settings, frames))
                    .catch(error => console.warn('特效加载失败', entry.feature, error));
            });
        }
    });
}
