const ice = '145, 221, 255';
const rose = '255, 164, 216';
const sparkColors = [ice, rose, '218, 198, 255', '255, 233, 218'];
const clickExclusions = [
    'a', 'button', 'input', 'select', 'textarea', 'label', 'form', 'summary',
    'iframe', 'video', 'audio', 'dialog', '[inert]', '[contenteditable]', '[tabindex]',
    '[role="button"]', '[role="link"]', '[role="dialog"]', '[role="menu"]',
    '.ag-header', '.ag-cmdk', '.ag-lightbox', '.ag-article', '.ag-content',
    '.ag-tree', '.ag-gallery', '.ag-subscribe', 'h1', 'h2', 'h3', 'h4', 'p', 'pre', 'code', 'blockquote',
].join(',');

const between = (min, max) => min + Math.random() * (max - min);
const color = (rgb, alpha) => 'rgba(' + rgb + ', ' + alpha + ')';

export function mountSkyEffects(settings, frames) {
    const canvas = document.querySelector('.ag-sky-effects');
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const hero = document.querySelector('.ag-home-hero');
    const listeners = new AbortController();
    const listenerOptions = { passive: true, signal: listeners.signal };
    const sparks = [];
    const ripples = [];
    let policy = { enabled: false, meteor: false, sparks: false, intensity: 0, compact: false };
    let width = 0;
    let height = 0;
    let heroVisible = false;
    let hasShownMeteor = false;
    let meteor = null;
    let meteorTimer = 0;

    canvas.hidden = true;

    const effectsAllowed = () => policy.enabled && policy.intensity > 0 && !document.hidden;
    const meteorsAllowed = () => effectsAllowed() && policy.meteor && heroVisible;

    function measureCanvas() {
        width = window.innerWidth;
        height = window.innerHeight;
        // Cap the back buffer on high-DPR phones and large displays.
        const pixels = Math.max(1, width * height);
        const scale = Math.min(window.devicePixelRatio || 1, policy.compact ? 1.25 : 1.5, Math.sqrt(3000000 / pixels));
        const pixelWidth = Math.max(1, Math.round(width * scale));
        const pixelHeight = Math.max(1, Math.round(height * scale));

        if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    function startFrame() {
        if (canvas.hidden) {
            measureCanvas();
            ctx.clearRect(0, 0, width, height);
            canvas.hidden = false;
        }
        frames.request(drawFrame);
    }

    function stopFrame() {
        frames.cancel(drawFrame);
        canvas.hidden = true;
    }

    function scheduleMeteor(immediate = false) {
        if (!meteorsAllowed() || meteorTimer || meteor) return;

        // The first comet arrives sooner and the sky rests between later ones.
        const delay = immediate ? 0 : hasShownMeteor ? between(13000, 24000) : between(6000, 10000);
        meteorTimer = setTimeout(() => {
            meteorTimer = 0;
            if (!meteorsAllowed()) return;

            const bounds = hero.getBoundingClientRect();
            const top = Math.max(0, bounds.top);
            const visibleHeight = Math.min(window.innerHeight, bounds.bottom) - top;
            if (visibleHeight < 100) {
                scheduleMeteor();
                return;
            }

            const angle = between(0.4, 0.66);
            const viewWidth = window.innerWidth;
            const distance = Math.min(viewWidth * between(0.36, 0.5), 600);
            meteor = {
                started: performance.now(),
                sceneTop: bounds.top + window.scrollY,
                sceneBottom: bounds.bottom + window.scrollY,
                duration: between(620, 930),
                x: viewWidth * (policy.compact ? between(0.16, 0.55) : between(0.46, 0.69)),
                y: top + visibleHeight * between(0.09, 0.23),
                distance,
                length: Math.min(viewWidth * between(0.23, 0.34), 220),
                angle,
                tint: Math.random() < 0.5 ? ice : rose,
            };
            hasShownMeteor = true;
            startFrame();
        }, delay);
    }

    function drawMeteor(now) {
        const age = Math.max(0, (now - meteor.started) / meteor.duration);
        if (age >= 1) {
            meteor = null;
            scheduleMeteor();
            return;
        }

        const top = Math.max(0, meteor.sceneTop - window.scrollY);
        const bottom = Math.min(height, meteor.sceneBottom - window.scrollY);
        if (bottom <= top) return;

        const travel = meteor.distance * age;
        const length = Math.min(meteor.length, travel);
        if (length < 1) return;
        const alpha = Math.min(age * 12, 1, (1 - age) * 3.8) * (0.55 + policy.intensity * 0.45);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, top, width, bottom - top);
        ctx.clip();
        ctx.translate(meteor.x + Math.cos(meteor.angle) * travel, meteor.y + Math.sin(meteor.angle) * travel);
        ctx.rotate(meteor.angle);

        const trail = ctx.createLinearGradient(-length, 0, 0, 0);
        trail.addColorStop(0, color(meteor.tint, 0));
        trail.addColorStop(0.66, color(meteor.tint, alpha * 0.62));
        trail.addColorStop(1, color('244, 250, 255', alpha));
        ctx.fillStyle = trail;
        ctx.beginPath();
        ctx.moveTo(-length, 0);
        ctx.quadraticCurveTo(-length * 0.22, -1, 0, -2.1);
        ctx.lineTo(0, 2.1);
        ctx.quadraticCurveTo(-length * 0.22, 1, -length, 0);
        ctx.fill();

        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
        glow.addColorStop(0, color('255, 250, 255', alpha));
        glow.addColorStop(0.28, color(meteor.tint, alpha * 0.8));
        glow.addColorStop(1, color(meteor.tint, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(-10, -10, 20, 20);
        ctx.restore();
    }

    function drawSparks(now) {
        for (let index = sparks.length - 1; index >= 0; index -= 1) {
            const spark = sparks[index];
            const age = Math.max(0, (now - spark.started) / spark.duration);
            if (age >= 1) {
                sparks.splice(index, 1);
                continue;
            }

            const travel = 1 - (1 - age) * (1 - age);
            const x = spark.x + spark.dx * travel;
            const y = spark.y + spark.dy * travel + 20 * age * age;
            const tail = 0.13 * (1 - age);
            ctx.strokeStyle = color(spark.tint, (1 - age) * (0.45 + policy.intensity * 0.55));
            ctx.lineWidth = Math.max(0.5, spark.size * (1 - age));
            ctx.beginPath();
            ctx.moveTo(x - spark.dx * tail, y - spark.dy * tail);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    }

    function drawRipples(now) {
        for (let index = ripples.length - 1; index >= 0; index--) {
            const ripple = ripples[index];
            const life = Math.max(0, (now - ripple.started) / 460);
            if (life >= 1) {
                ripples.splice(index, 1);
                continue;
            }
            const fade = 1 - life;
            ctx.strokeStyle = color('231, 219, 255', fade * .6 * policy.intensity);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(ripple.x, ripple.y, 3 + (1 - fade * fade) * ripple.radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }

    function drawFrame(now) {
        if (!effectsAllowed()) {
            stopFrame();
            return;
        }

        ctx.clearRect(0, 0, width, height);
        if (meteor) drawMeteor(now);
        if (ripples.length) drawRipples(now);
        if (sparks.length) drawSparks(now);
        if (meteor || sparks.length || ripples.length) startFrame();
        else stopFrame();
    }

    function updateActivity() {
        if (!meteorsAllowed()) {
            clearTimeout(meteorTimer);
            meteorTimer = 0;
            meteor = null;
        }
        if (!effectsAllowed() || !policy.sparks) {
            sparks.length = 0;
            ripples.length = 0;
        }
        if (!meteor && !sparks.length && !ripples.length) stopFrame();
        scheduleMeteor();
    }

    function addSparks(event) {
        if (!effectsAllowed() || !policy.sparks || event.defaultPrevented || event.button !== 0 || event.detail === 0) return;
        if (!(event.target instanceof Element) || event.target.closest(clickExclusions)) return;
        if (window.getSelection()?.isCollapsed === false) return;

        // Keep at most two bursts in flight. Phones draw half as many marks.
        const maximum = policy.compact ? 8 : 16;
        const count = Math.round(maximum * (0.6 + policy.intensity * 0.4));
        const started = performance.now();
        const offset = between(0, Math.PI * 2);
        if (ripples.length === 2) ripples.shift();
        ripples.push({ started, x: event.clientX, y: event.clientY, radius: policy.compact ? 35 : 52 });
        sparks.splice(0, Math.max(0, sparks.length + count - maximum * 2));

        for (let index = 0; index < count; index += 1) {
            const angle = offset + (index / count + between(-0.025, 0.025)) * Math.PI * 2;
            const distance = between(26, policy.compact ? 60 : 88);
            sparks.push({
                started,
                x: event.clientX,
                y: event.clientY,
                dx: Math.cos(angle) * distance,
                dy: Math.sin(angle) * distance,
                duration: between(320, 610),
                size: between(1.3, 2.7),
                tint: sparkColors[index % sparkColors.length],
            });
        }

        startFrame();
    }

    const observer = hero && 'IntersectionObserver' in window
        ? new IntersectionObserver(([entry]) => {
            heroVisible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
            updateActivity();
        }, { threshold: 0.2 })
        : null;
    if (observer) observer.observe(hero);

    document.addEventListener('ag:launch-comet', () => {
        if (!meteorsAllowed() || meteor) return;
        clearTimeout(meteorTimer);
        meteorTimer = 0;
        scheduleMeteor(true);
    }, listenerOptions);
    document.addEventListener('click', addSparks, listenerOptions);
    document.addEventListener('visibilitychange', updateActivity, listenerOptions);
    window.addEventListener('resize', () => {
        if (!canvas.hidden) measureCanvas();
    }, listenerOptions);

    const unsubscribe = settings.subscribe((next) => {
        const compactChanged = policy.compact !== next.compact;
        policy = next;
        updateActivity();
        if (compactChanged && !canvas.hidden) measureCanvas();
    });

    return () => {
        listeners.abort();
        observer?.disconnect();
        clearTimeout(meteorTimer);
        stopFrame();
        if (typeof unsubscribe === 'function') unsubscribe();
    };
}
