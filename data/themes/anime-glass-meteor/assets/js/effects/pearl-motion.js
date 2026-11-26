const CARDS = '.pearl-orbit-card, .pearl-gallery-panel, .ag-card, .ag-featured, .ag-tool';

export function mountPearlMotion(settings, frames) {
    const root = document.documentElement;
    let policy = {};
    let target = null;
    let bounds;
    let point;

    function clearCard() {
        frames.cancel(paint);
        if (!target) return;
        target.removeAttribute('data-ag-pearl-active');
        target = null;
        bounds = undefined;
    }

    function paint() {
        if (!target || !point || !bounds || !policy.enabled) return;
        if (!bounds.width || !bounds.height) return;
        const x = Math.max(0, Math.min(1, (point.x - bounds.left) / bounds.width));
        const y = Math.max(0, Math.min(1, (point.y - bounds.top) / bounds.height));
        target.style.setProperty('--mouse-x', (x * 100).toFixed(1) + '%');
        target.style.setProperty('--mouse-y', (y * 100).toFixed(1) + '%');
        // Maximal tilt is four degrees at the edge, scaled by the appearance slider.
        target.style.setProperty('--pearl-tilt-y', ((x - .5) * 8 * policy.intensity).toFixed(2) + 'deg');
        target.style.setProperty('--pearl-tilt-x', ((.5 - y) * 8 * policy.intensity).toFixed(2) + 'deg');
    }

    document.addEventListener('pointermove', event => {
        if (!policy.enabled || policy.coarse || !(policy.prism || policy.cardTilt) || event.pointerType !== 'mouse') return;
        const next = event.target.closest(CARDS);
        if (next !== target) {
            clearCard();
            if (!next) return;
            target = next;
            bounds = target.getBoundingClientRect();
            if (!target.querySelector('.ag-prism-rim')) {
                const rim = document.createElement('span');
                rim.className = 'ag-prism-rim';
                rim.setAttribute('aria-hidden', 'true');
                target.append(rim);
            }
            target.setAttribute('data-ag-pearl-active', '');
        }
        if (target) {
            bounds ||= target.getBoundingClientRect();
            point = { x: event.clientX, y: event.clientY };
            frames.request(paint);
        }
    }, { passive: true });

    window.addEventListener('scroll', () => { bounds = undefined; }, { passive: true });
    window.addEventListener('resize', () => { bounds = undefined; }, { passive: true });
    document.documentElement.addEventListener('pointerleave', clearCard, { passive: true });
    window.addEventListener('blur', clearCard);

    settings.subscribe(next => {
        policy = next;
        if (!policy.enabled || !(policy.prism || policy.cardTilt)) clearCard();
        root.toggleAttribute('data-ag-pearl-motion', policy.enabled);
    });
}
