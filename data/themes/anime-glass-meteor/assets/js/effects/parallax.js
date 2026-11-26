const clamp = (value) => Math.max(-1, Math.min(1, value));

export function mountParallax(settings, frames) {
    const hero = document.querySelector('.ag-home-hero');
    if (!hero) return;

    const listeners = new AbortController();
    const passive = { passive: true, signal: listeners.signal };
    const tiltButton = document.querySelector('[data-effects-tilt]');
    const orientation = window.DeviceOrientationEvent;
    const touch = window.matchMedia('(any-pointer: coarse)');
    let visible = !('IntersectionObserver' in window);
    let active = false;
    let tiltEnabled = false;
    let tiltListening = false;
    let tiltOrigin = null;
    let tiltPending = false;
    let tiltDenied = false;
    let policy = {};
    let x = 0;
    let y = 0;
    let targetX = 0;
    let targetY = 0;

    function paint() {
        if (!active) return;
        const distance = policy.intensity * (policy.compact ? 0.55 : 1);
        // Ease toward the latest input. Once settled, the shared frame loop can sleep.
        x += (targetX - x) * 0.16;
        y += (targetY - y) * 0.16;

        if (Math.abs(targetX - x) < 0.006) x = targetX;
        if (Math.abs(targetY - y) < 0.006) y = targetY;
        hero.style.setProperty('--ag-parallax-x', (x * 10 * distance).toFixed(2) + 'px');
        hero.style.setProperty('--ag-parallax-y', (y * 7 * distance).toFixed(2) + 'px');
        hero.style.setProperty('--ag-parallax-glow', (distance * (0.25 + Math.hypot(x, y) * 0.2)).toFixed(3));

        if (x !== targetX || y !== targetY) frames.request(paint);
    }

    function move(nextX, nextY) {
        nextX = clamp(nextX);
        nextY = clamp(nextY);
        if (nextX === targetX && nextY === targetY) return;
        targetX = nextX;
        targetY = nextY;
        frames.request(paint);
    }

    function onOrientation(event) {
        if (!active || !Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
        if (!tiltOrigin) tiltOrigin = { gamma: event.gamma, beta: event.beta };

        const horizontal = (event.gamma - tiltOrigin.gamma) / 22;
        const vertical = (event.beta - tiltOrigin.beta) / 24;
        const angle = (window.screen.orientation?.angle || 0) * Math.PI / 180;
        const nextX = clamp(horizontal * Math.cos(angle) + vertical * Math.sin(angle));
        const nextY = clamp(vertical * Math.cos(angle) - horizontal * Math.sin(angle));
        // Ignore about a degree of sensor jitter when the device is still.
        if (Math.hypot(nextX - targetX, nextY - targetY) > 0.04) move(nextX, nextY);
    }

    function updateTiltListener() {
        const shouldListen = active && tiltEnabled && touch.matches;
        if (shouldListen === tiltListening) return;
        tiltListening = shouldListen;
        tiltOrigin = null;
        if (shouldListen) window.addEventListener('deviceorientation', onOrientation, passive);
        else window.removeEventListener('deviceorientation', onOrientation);
    }

    function updateActivity() {
        active = Boolean(policy.enabled && policy.parallax && policy.intensity > 0 && visible && !document.hidden);
        hero.classList.toggle('ag-parallax-active', active);
        updateTiltListener();

        if (active) {
            frames.request(paint);
        } else {
            frames.cancel(paint);
            x = y = targetX = targetY = 0;
            hero.style.removeProperty('--ag-parallax-x');
            hero.style.removeProperty('--ag-parallax-y');
            hero.style.removeProperty('--ag-parallax-glow');
        }
    }

    function renderTiltButton() {
        if (!tiltButton) return;
        tiltButton.hidden = !(orientation && touch.matches && window.isSecureContext);
        tiltButton.setAttribute('aria-pressed', String(tiltEnabled));
        tiltButton.disabled = tiltPending;
        tiltButton.title = tiltEnabled ? '点按关闭倾斜控制'
            : tiltDenied ? '浏览器未授权方向传感器' : '点按开启倾斜控制';
        updateTiltListener();
    }

    async function toggleTilt() {
        if (tiltButton.hidden || tiltPending) return;
        if (tiltEnabled) {
            tiltEnabled = false;
            renderTiltButton();
            if (active) move(0, 0);
            return;
        }

        tiltPending = true;
        tiltDenied = false;
        renderTiltButton();
        try {
            // Ask only from this click. The settings dialog may pause animation until it closes.
            tiltEnabled = typeof orientation.requestPermission !== 'function'
                || (await orientation.requestPermission()) === 'granted';
        } catch {
            tiltEnabled = false;
        } finally {
            tiltPending = false;
            tiltDenied = !tiltEnabled;
            if (!listeners.signal.aborted) {
                renderTiltButton();
            }
        }
    }

    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.15;
        updateActivity();
    }, { threshold: 0.15 }) : null;
    observer?.observe(hero);

    hero.addEventListener('pointermove', event => {
        if (!active || event.pointerType !== 'mouse') return;
        move(event.clientX / window.innerWidth * 2 - 1, event.clientY / window.innerHeight * 2 - 1);
    }, passive);
    hero.addEventListener('pointerleave', event => {
        if (active && event.pointerType === 'mouse') move(0, 0);
    }, passive);
    window.addEventListener('resize', () => {
        tiltOrigin = null;
    }, passive);
    document.addEventListener('visibilitychange', updateActivity, passive);
    tiltButton?.addEventListener('click', toggleTilt, passive);
    touch.addEventListener('change', renderTiltButton, passive);
    renderTiltButton();

    const unsubscribe = settings.subscribe(next => {
        policy = next;
        updateActivity();
    });

    return () => {
        listeners.abort();
        observer?.disconnect();
        unsubscribe?.();
        policy = {};
        updateActivity();
        if (tiltButton) tiltButton.hidden = true;
    };
}
