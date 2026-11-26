// 各色罩保留同一张壁纸。修改 RGBA 或色标位置即可微调时段的光线。
const TWILIGHT = { angle: 145, stops: [[51, 22, 82, 0.34, 0], [163, 70, 130, 0.26, 50], [252, 128, 78, 0.36, 100]] };
const NIGHT = { angle: 155, stops: [[4, 12, 46, 0.68, 0], [25, 36, 91, 0.36, 54], [46, 29, 84, 0.62, 100]] };
const DAWN = { angle: 155, stops: [[41, 52, 100, 0.25, 0], [124, 137, 193, 0.27, 52], [255, 212, 155, 0.42, 100]] };
const NIGHT_AT = 0.46;

const unit = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => value * value * (3 - 2 * value);
const mix = (from, to, weight) => from + (to - from) * weight;

function gradient(from, to, weight) {
    const angle = Math.round(mix(from.angle, to.angle, weight));
    const stops = from.stops.map((stop, index) => {
        const [r, g, b, a, position] = stop.map((channel, part) => mix(channel, to.stops[index][part], weight));
        return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(3)}) ${position.toFixed(1)}%`;
    });
    return `linear-gradient(${angle}deg, ${stops.join(', ')})`;
}

export function mountScrollScenes(settings, frames) {
    const hero = document.querySelector('.home-template .ag-home-hero');
    if (!hero) return;

    const root = document.documentElement;
    const viewport = document.querySelector('.ag-viewport');
    const veil = document.querySelector('.ag-bg-veil');
    const layers = veil ? [TWILIGHT, NIGHT, DAWN].map(palette => {
        const layer = document.createElement('i');
        layer.className = 'ag-pearl-tone-layer';
        layer.style.background = gradient(palette, palette, 0);
        layer.hidden = true;
        veil.append(layer);
        return layer;
    }) : [];
    const events = new AbortController();
    const options = { passive: true, signal: events.signal };
    let active = false;
    let compact = false;
    let progressStep = -1;
    let revealStep = -1;
    let maxY = 1;
    let heroHeight = 1;

    function measure() {
        maxY = Math.max(1, root.scrollHeight - window.innerHeight);
        heroHeight = Math.max(1, hero.offsetHeight);
        update();
    }

    function paint() {
        if (!active) return;
        const y = Math.max(0, window.scrollY);

        // 移动端减少色罩重绘次数。滚动停止后不会继续请求帧。
        const precision = compact ? 100 : 240;
        const nextProgress = Math.round(unit(y / maxY) * precision);
        if (nextProgress !== progressStep) {
            progressStep = nextProgress;
            const progress = progressStep / precision;
            const beforeNight = progress < NIGHT_AT;
            const weight = beforeNight ? ease(progress / NIGHT_AT) : ease((progress - NIGHT_AT) / (1 - NIGHT_AT));
            if (root.dataset.theme !== 'dark') {
                const opacity = beforeNight ? [1 - weight, weight, 0] : [0, 1 - weight, weight];
                layers.forEach((layer, index) => { layer.style.opacity = (opacity[index] * .24).toFixed(3); });
            } else {
                root.style.setProperty('--ag-scene-tone', beforeNight ? gradient(TWILIGHT, NIGHT, weight) : gradient(NIGHT, DAWN, weight));
            }
        }

        if (root.dataset.theme !== 'dark') return;

        // 首屏本身已有壁纸。等画面逐步滚出，再显露正文边缘的同张壁纸。
        const nextReveal = Math.round(ease(unit((y / heroHeight - 0.5) / 0.5)) * 40);
        if (nextReveal !== revealStep) {
            revealStep = nextReveal;
            root.style.setProperty('--ag-scene-reveal', (nextReveal / 40).toFixed(3));
        }
    }

    const update = () => { if (active) frames.request(paint); };

    function reset() {
        frames.cancel(paint);
        delete root.dataset.agScrollScene;
        root.style.removeProperty('--ag-scene-tone');
        root.style.removeProperty('--ag-scene-reveal');
        layers.forEach(layer => { layer.hidden = true; });
        progressStep = -1;
        revealStep = -1;
    }

    window.addEventListener('scroll', update, options);
    window.addEventListener('resize', measure, options);
    window.addEventListener('pageshow', measure, options);
    const themeObserver = new MutationObserver(() => {
        progressStep = revealStep = -1;
        root.style.removeProperty('--ag-scene-tone');
        update();
    });
    themeObserver.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    const observer = typeof ResizeObserver === 'function' && viewport ? new ResizeObserver(measure) : null;
    observer?.observe(viewport);

    const unsubscribe = settings.subscribe((policy) => {
        const next = Boolean(policy.enabled && policy.scrollScene && policy.tone === 'original');
        if (next === active && compact === policy.compact) return;
        active = next;
        compact = policy.compact;
        if (!active) {
            reset();
            return;
        }
        progressStep = -1;
        root.dataset.agScrollScene = 'on';
        layers.forEach(layer => { layer.hidden = false; });
        measure();
    });

    return () => {
        unsubscribe?.();
        events.abort();
        observer?.disconnect();
        themeObserver.disconnect();
        layers.forEach(layer => layer.remove());
        reset();
    };
}
