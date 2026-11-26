// 粒子上限依次为轻量设备和常规设备；频率只控制数量，大小只控制绘制尺寸。
const LIMITS = {
    petals: [12, 27],
    rain: [22, 56],
    fireflies: [11, 24],
    mist: [7, 15]
};
const CARD_SELECTOR = '.pearl-orbit-card, .ag-article, .ag-card, .ag-life-card-link, .ag-galaxy-preview, .ag-tool, .ag-hero-small, .pearl-dock';
const GALLERY_PANEL = '.pearl-gallery-panel';
const IMPACT_LIFE = { rain: 455, petals: 3650, fireflies: 720, mist: 900 };
const TAU = Math.PI * 2;
const range = (min, max) => min + Math.random() * (max - min);
const edgeY = (surface, x) => surface.top + (x - surface.left) * surface.slope;

function createParticle(mode, width, height) {
    const speed = mode === 'rain' ? range(255, 435) : mode === 'petals' ? range(36, 72) : range(14, 36);
    const size = mode === 'rain' ? speed / 24 : mode === 'petals' ? range(3.6, 7.3) : range(1.1, 2.5);
    return { x: range(0, width), y: range(0, height), speed, size, phase: range(0, TAU) };
}

function wrap(value, span) {
    return ((value % span) + span) % span;
}

function drawPetal(context, x, y, size, phase) {
    const sweep = 0.45 + 0.55 * Math.abs(Math.cos(phase));
    context.save();
    context.translate(x, y);
    context.rotate(phase * 0.7);
    context.scale(sweep, 1);
    context.globalAlpha = 0.21 + sweep * 0.44;
    context.fillStyle = '#ffc8dc';
    context.beginPath();
    context.moveTo(0, size);
    context.bezierCurveTo(-size, 0, -size * 0.75, -size, 0, -size * 0.78);
    context.bezierCurveTo(size * 0.64, -size * 1.04, size * 0.8, -size * 0.1, 0, size);
    context.fill();
    context.restore();
}

function drawRain(context, x, y, size) {
    context.globalAlpha = 0.48 * Math.min(1, size / 13);
    context.strokeStyle = '#bbddff';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + size * 0.28, y - size);
    context.stroke();
}

function drawMote(context, x, y, size, phase, mist) {
    const pulse = 0.33 + 0.67 * ((1 + Math.sin(phase)) / 2) ** 2;
    context.globalAlpha = pulse * (mist ? 0.08 : 0.15);
    context.fillStyle = mist ? '#ded6ff' : '#ffbf67';
    context.beginPath();
    context.arc(x, y, size * (mist ? 4.1 : 3.3), 0, TAU);
    context.fill();
    context.globalAlpha = pulse * (mist ? 0.56 : 0.9);
    context.fillStyle = mist ? '#fbf6ff' : '#fff3a9';
    context.beginPath();
    context.arc(x, y, size, 0, TAU);
    context.fill();
}

function drawImpact(context, mode, x, y, size, phase, age) {
    if (mode === 'petals') {
        const fade = Math.min(1, (1 - age) / 0.43);
        const radius = Math.max(2, size * 0.83);
        context.globalAlpha = fade * 0.68;
        context.fillStyle = '#ffcbe0';
        context.beginPath();
        context.ellipse(x, y - radius * 0.32, radius, radius * 0.38, Math.cos(phase) * 0.32, 0, TAU);
        context.fill();
        return;
    }

    const rain = mode === 'rain';
    const radius = rain ? 2 + age * Math.min(17, size + 4) : 2 + age * Math.min(12, size * 5);
    context.globalAlpha = (1 - age) ** 1.7 * (rain ? 0.65 : 0.5);
    context.strokeStyle = rain ? '#c1eaff' : mode === 'mist' ? '#e0d4ff' : '#fff3b2';
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(x, y, radius, radius * (rain ? 0.29 : 0.43), 0, 0, TAU);
    context.stroke();
    if (rain && age < 0.65) {
        context.fillStyle = '#d8f3ff';
        context.beginPath();
        const height = Math.sin(age * Math.PI) * Math.min(12, size);
        for (let offset = -1; offset <= 1; offset++) {
            const dropX = x + offset * radius * 0.62;
            const dropY = y - height * (1 - Math.abs(offset) * 0.37);
            context.moveTo(dropX + 0.85, dropY);
            context.arc(dropX, dropY, 0.85, 0, TAU);
        }
        context.fill();
    }
}

export function mountAtmosphere(settings, frames) {
    const main = document.querySelector('.ag-main') || document.body;
    const dialog = document.getElementById('ag-effects-settings');
    const gallery = main.querySelector('[data-pearl-gallery]');
    const galleryPoints = new Map();
    const narrow = window.matchMedia('(max-width: 760px)');
    const events = new AbortController();
    const options = { passive: true, signal: events.signal };
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.className = 'ag-weather-effects';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    document.body.append(canvas);

    let policy = {};
    let compact = false;
    let bonus = false;
    let particles = [];
    let impacts = [];
    let candidates = [];
    let surfaces = [];
    let dialogBounds = null;
    let candidatesDirty = true;
    let geometryDirty = true;
    let canvasDirty = true;
    let width = 1;
    let height = 1;
    let previousTime = 0;
    let nextPaint = 0;
    let geometryTime = -Infinity;
    let elapsed = 0;

    function canPaint() {
        return policy.atmosphereEnabled && !document.hidden
            && policy.frequency > 0 && policy.size > 0 && Object.hasOwn(LIMITS, policy.atmosphere);
    }

    function markGeometry() {
        geometryDirty = true;
    }

    function markCanvas() {
        canvasDirty = true;
        markGeometry();
    }

    function fitCanvas() {
        width = Math.max(1, canvas.clientWidth || window.innerWidth);
        height = Math.max(1, canvas.clientHeight || window.innerHeight);
        // 限制后备缓冲区面积；轻量设备不追随高分屏的设备像素比。
        const areaLimit = compact ? 720000 : 1500000;
        const scale = Math.min(window.devicePixelRatio || 1, compact ? 1 : 1.25, Math.sqrt(areaLimit / (width * height)));
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
        canvasDirty = false;
    }

    function pointsFor(panel) {
        let points = galleryPoints.get(panel);
        if (points) return points;
        // Zero-area markers follow the same 3D transform as the photo's top edge.
        points = ['left', 'right'].map(side => {
            const point = document.createElement('span');
            point.setAttribute('aria-hidden', 'true');
            point.style.cssText = `position:absolute;top:0;${side}:min(24px,8%);width:0;height:0;pointer-events:none`;
            return point;
        });
        panel.append(...points);
        galleryPoints.set(panel, points);
        return points;
    }

    function gallerySurface(panel, {left: clipLeft, right: clipRight}) {
        const [start, end] = pointsFor(panel).map(point => point.getBoundingClientRect());
        const left = Math.max(start.x, clipLeft, 0);
        const right = Math.min(end.x, clipRight, width);
        if (right - left < 12) return null;
        const slope = (end.y - start.y) / (end.x - start.x);
        const top = start.y + (left - start.x) * slope;
        const endY = top + (right - left) * slope;
        if (Math.max(top, endY) < 3 || Math.min(top, endY) > height - 10) return null;
        return { element: panel, left, right, top, slope };
    }

    function measureGeometry(now) {
        geometryDirty = false;
        geometryTime = now;
        dialogBounds = dialog?.open ? dialog.getBoundingClientRect() : null;
        surfaces = [];
        if (!bonus || compact) return;
        if (candidatesDirty) {
            candidates = Array.from(main.querySelectorAll(CARD_SELECTOR + ', ' + GALLERY_PANEL));
            candidatesDirty = false;
        }
        const galleryBounds = policy.atmosphere === 'rain' && gallery?.getBoundingClientRect();

        // 一次收集当前可见的卡片上沿。粒子仅查这份坐标，不触发 DOM 布局。
        for (const element of candidates) {
            if (surfaces.length >= 24) break;
            if (element.matches(GALLERY_PANEL)) {
                const surface = galleryBounds && gallerySurface(element, galleryBounds);
                if (surface) surfaces.push(surface);
                continue;
            }
            if (element.classList.contains('pearl-orbit-card') && !element.hasAttribute('data-pearl-active')) continue;
            const {left, right, top, width: cardWidth, height: cardHeight} = element.getBoundingClientRect();
            if (top < 3 || top > height - 10 || right <= 0 || left >= width || cardWidth < 36 || cardHeight < 22) continue;
            const inset = Math.min(12, cardWidth * 0.07);
            surfaces.push({ element, left: left + inset, right: right - inset, top, slope: 0 });
        }
    }

    function impactSurface(x, y, nextX, nextY) {
        if (nextY <= y) return null;
        let contact = null;
        let first = 1;
        for (const surface of surfaces) {
            const above = edgeY(surface, x) - y;
            const below = nextY - edgeY(surface, nextX);
            if (above <= 0 || below < 0) continue;
            const time = above / (above + below);
            if (time > first) continue;
            const atX = x + (nextX - x) * time;
            if (atX < surface.left || atX > surface.right) continue;
            const atY = y + (nextY - y) * time;
            if (atY < 3 || atY > height - 10) continue;
            first = time;
            contact = { element: surface.element, relativeX: (atX - surface.left) / (surface.right - surface.left) };
        }
        if (contact) return contact;
        const floor = height - 4;
        if (y < floor && nextY >= floor) {
            const atX = x + (nextX - x) * (floor - y) / (nextY - y);
            return { element: null, relativeX: wrap(atX, width) / width };
        }
        return null;
    }

    function addImpact(contact, size, phase, now) {
        if (policy.atmosphere === 'petals'
            && impacts.filter(impact => impact.element === contact.element).length >= (compact ? 7 : 9)) return;
        const limit = compact ? 13 : 38;
        if (impacts.length >= limit) impacts.shift();
        impacts.push({ ...contact, size, phase, time: now });
    }

    function advance(particle, mode, delta, size, now) {
        const distance = particle.speed * delta;
        const sway = Math.sin(elapsed + particle.phase);
        let nextX;
        let nextY;
        if (mode === 'rain') {
            nextX = particle.x - distance * 0.28;
            nextY = particle.y + distance;
        } else if (mode === 'petals') {
            nextX = particle.x + delta * (17 + sway * 15);
            nextY = particle.y + distance;
        } else {
            nextX = particle.x + distance * Math.cos(elapsed * 0.7 + particle.phase);
            nextY = particle.y + distance * (0.64 + sway * 0.5);
        }

        const tip = mode === 'petals' ? size * 0.65 : 0;
        const contact = bonus && impactSurface(particle.x, particle.y + tip, nextX, nextY + tip);
        if (contact) {
            addImpact(contact, size, particle.phase, now);
            particle.x = range(0, width);
            particle.y = -range(12, 36);
        } else {
            particle.x = wrap(nextX, width);
            particle.y = wrap(nextY + 36, height + 36) - 36;
        }
    }

    function drawImpacts(now, mode) {
        for (let index = impacts.length - 1; index >= 0; index--) {
            const impact = impacts[index];
            const age = (now - impact.time) / IMPACT_LIFE[mode];
            if (age >= 1) {
                impacts.splice(index, 1);
                continue;
            }
            const surface = impact.element && surfaces.find(candidate => candidate.element === impact.element);
            if (!impact.element) {
                drawImpact(context, mode, width * impact.relativeX, height - 4, impact.size, impact.phase, age);
            } else if (surface) {
                const x = surface.left + (surface.right - surface.left) * impact.relativeX;
                drawImpact(context, mode, x, edgeY(surface, x), impact.size, impact.phase, age);
            }
        }
    }

    function stop() {
        frames.cancel(paint);
        if (!canvas.hidden) {
            canvas.hidden = true;
            canvas.width = 1;
            canvas.height = 1;
        }
        particles = [];
        impacts = [];
        previousTime = 0;
        nextPaint = 0;
        markCanvas();
    }

    function paint(now) {
        if (!canPaint()) {
            stop();
            return;
        }

        const interval = 1000 / 60;
        // 跟随统一的 rAF；高刷新屏最多每约 16ms 画一次，手机靠数量和分辨率降级。
        if (now + 0.6 < nextPaint) {
            frames.request(paint);
            return;
        }
        const lapse = previousTime ? now - previousTime : interval;
        previousTime = now;
        nextPaint = Math.max(nextPaint, now - interval * 0.5) + interval;
        if (canvasDirty) fitCanvas();
        if (geometryDirty || (dialog?.open || bonus && !compact) && now - geometryTime > 150) measureGeometry(now);

        const delta = Math.min(lapse / 1000, 0.06);
        elapsed += delta;
        const mode = policy.atmosphere;
        const count = Math.ceil(LIMITS[mode][compact ? 0 : 1] * policy.frequency);
        const sizeScale = 0.48 + 0.9 * policy.size;
        while (particles.length < count) particles.push(createParticle(mode, width, height));
        particles.length = count;

        context.clearRect(0, 0, width, height);
        if (dialogBounds?.width) {
            context.save();
            context.beginPath();
            context.rect(0, 0, width, height);
            // 在半透明弹窗背后也留空。边缘多留一个像素，避免抗锯齿残影。
            const left = Math.max(0, dialogBounds.left - 1);
            const top = Math.max(0, dialogBounds.top - 1);
            const right = Math.min(width, dialogBounds.right + 1);
            const bottom = Math.min(height, dialogBounds.bottom + 1);
            if (right > left && bottom > top) context.rect(left, top, right - left, bottom - top);
            context.clip('evenodd');
        }

        for (const particle of particles) {
            const size = particle.size * sizeScale;
            advance(particle, mode, delta, size, now);
            if (mode === 'rain') drawRain(context, particle.x, particle.y, size);
            else if (mode === 'petals') drawPetal(context, particle.x, particle.y, size, elapsed * 1.9 + particle.phase);
            else drawMote(context, particle.x, particle.y, size, elapsed * 2.2 + particle.phase, mode === 'mist');
        }
        if (bonus) drawImpacts(now, mode);
        if (dialogBounds?.width) context.restore();
        context.globalAlpha = 1;
        frames.request(paint);
    }

    const changes = new MutationObserver(records => {
        if (records.some(record => record.type === 'childList')) candidatesDirty = true;
        markGeometry();
    });
    changes.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-pearl-active', 'data-pearl-centered'] });
    if (dialog) changes.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(markGeometry) : null;
    sizes?.observe(main);
    if (dialog) sizes?.observe(dialog);

    window.addEventListener('scroll', markGeometry, options);
    window.addEventListener('resize', markCanvas, options);
    window.visualViewport?.addEventListener('resize', markCanvas, options);
    gallery?.addEventListener('scroll', markGeometry, options);

    function refreshDevice() {
        const nextCompact = narrow.matches || policy.compact || policy.coarse;
        if (compact !== nextCompact) {
            compact = nextCompact;
            impacts = [];
            markCanvas();
        }
    }

    narrow.addEventListener('change', refreshDevice, options);
    const unsubscribe = settings.subscribe(next => {
        const modeChanged = policy.atmosphere !== next.atmosphere;
        policy = next;
        refreshDevice();
        bonus = policy.frequency >= 0.7 && policy.size >= 0.7;
        if (!bonus || modeChanged) impacts = [];
        if (modeChanged) particles = [];
        markGeometry();
        if (canPaint()) {
            const firstPaint = canvas.hidden;
            canvas.hidden = false;
            if (firstPaint) paint(performance.now());
            else frames.request(paint);
        } else if (document.hidden && !modeChanged) {
            // Keep the scene for history restores and tab switches.
            frames.cancel(paint);
            previousTime = 0;
            nextPaint = 0;
        } else {
            stop();
        }
    });

    return () => {
        unsubscribe?.();
        changes.disconnect();
        sizes?.disconnect();
        events.abort();
        stop();
        for (const points of galleryPoints.values()) points.forEach(point => point.remove());
        canvas.remove();
    };
}
