const inputSurfaces = 'input, textarea, select, iframe, dialog, [contenteditable], [role="dialog"]';

export function mountCursorThread(settings, frames) {
    const listeners = new AbortController();
    const passive = { passive: true, signal: listeners.signal };
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const canvas = document.createElement('canvas');
    canvas.className = 'ag-cursor-thread';
    canvas.hidden = true;
    canvas.setAttribute('aria-hidden', 'true');

    const points = [];
    const dust = [];
    let policy = {};
    let last = null;
    let dustDistance = 0;
    let ctx = null;
    let damage = null;

    const allowed = () => pointer.matches && policy.enabled && policy.thread
        && policy.intensity > 0 && !document.hidden;
    const lifetime = () => policy.compact ? 235 : 330;

    function sizeCanvas() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const scale = Math.min(window.devicePixelRatio || 1, policy.compact ? 1 : 1.5,
            Math.sqrt(2400000 / Math.max(1, width * height)));
        const pixelWidth = Math.max(1, Math.round(width * scale));
        const pixelHeight = Math.max(1, Math.round(height * scale));

        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
            damage = null;
        }
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.lineCap = 'round';
    }

    function clearPaint() {
        if (!damage) return;
        ctx.clearRect(damage.left, damage.top, damage.right - damage.left, damage.bottom - damage.top);
        damage = null;
    }

    function reset() {
        frames.cancel(paint);
        points.length = 0;
        dust.length = 0;
        last = null;
        dustDistance = 0;
        clearPaint();
        canvas.hidden = true;
    }

    function stroke(from, to, color, opacity, width) {
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
    }

    function offset(point, before, after) {
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        const length = Math.hypot(dx, dy) || 1;
        const weave = Math.sin(point.distance / 4.5) * (policy.compact ? 1.1 : 1.8);
        return { x: -dy * weave / length, y: dx * weave / length };
    }

    function drawBraid(now) {
        const fade = lifetime();
        for (let index = 1; index < points.length; index += 1) {
            const from = points[index - 1];
            const to = points[index];
            const a = offset(from, points[index - 2] || from, to);
            const b = offset(to, from, points[index + 1] || to);
            const opacity = (1 - (now - from.time) / fade) * (0.42 + 0.52 * policy.intensity);
            if (opacity <= 0) continue;

            // The fine strands cross about every 14 px of pointer travel.
            stroke(from, to, '#ff7898', opacity * 0.20, 4.4);
            stroke({ x: from.x - a.x, y: from.y - a.y }, { x: to.x - b.x, y: to.y - b.y },
                '#d52151', opacity, 1.6);
            stroke({ x: from.x + a.x, y: from.y + a.y }, { x: to.x + b.x, y: to.y + b.y },
                '#ffabbc', opacity * 0.92, 1.15);
        }
    }

    function drawDust(now) {
        ctx.fillStyle = '#ffe2d5';
        for (const star of dust) {
            const age = Math.min(1, (now - star.time) / lifetime());
            const x = star.x + star.drift * age;
            const y = star.y - 8 * age;
            const radius = star.radius * (1 - age * 0.55);
            ctx.globalAlpha = (1 - age) * policy.intensity * 0.85;
            ctx.beginPath();
            ctx.moveTo(x, y - radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.quadraticCurveTo(x, y, x, y + radius);
            ctx.quadraticCurveTo(x, y, x - radius, y);
            ctx.quadraticCurveTo(x, y, x, y - radius);
            ctx.fill();
        }
    }

    function paint(now) {
        if (!allowed()) {
            reset();
            return;
        }

        const oldest = now - lifetime();
        while (points.length && points[0].time <= oldest) points.shift();
        while (dust.length && dust[0].time <= oldest) dust.shift();

        if (points.length < 2 && !dust.length) {
            clearPaint();
            canvas.hidden = true;
            return;
        }

        if (canvas.hidden) {
            ctx ||= canvas.getContext('2d');
            if (!ctx) return;
            if (!canvas.isConnected) document.body.append(canvas);
            sizeCanvas();
            canvas.hidden = false;
        }

        clearPaint();
        drawBraid(now);
        drawDust(now);
        ctx.globalAlpha = 1;

        // Clear only the previous trail's footprint on the next frame.
        damage = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        for (const group of [points, dust]) {
            for (const { x, y } of group) {
                damage.left = Math.min(damage.left, x - 15);
                damage.top = Math.min(damage.top, y - 15);
                damage.right = Math.max(damage.right, x + 15);
                damage.bottom = Math.max(damage.bottom, y + 15);
            }
        }
        frames.request(paint);
    }

    function track(event) {
        if (!allowed() || event.pointerType !== 'mouse') return;
        if (event.buttons || event.target.closest?.(inputSurfaces) || window.getSelection()?.isCollapsed === false) {
            reset();
            return;
        }

        const point = { x: event.clientX, y: event.clientY, time: performance.now(), distance: 0 };
        const travel = last ? Math.hypot(point.x - last.x, point.y - last.y) : 0;
        if (!last || point.time - last.time >= lifetime() || travel > 190) {
            points.length = 0;
            points.push(point);
            dustDistance = 0;
            last = point;
            return;
        }
        if (travel < 3) return;

        // Sample along longer steps so the braid holds its shape when the mouse moves quickly.
        const steps = Math.ceil(travel / 8);
        for (let index = 1; index <= steps; index += 1) {
            const fraction = index / steps;
            points.push({
                x: last.x + (point.x - last.x) * fraction,
                y: last.y + (point.y - last.y) * fraction,
                time: last.time + (point.time - last.time) * fraction,
                distance: last.distance + travel * fraction,
            });
        }
        point.distance = last.distance + travel;
        last = point;
        const maximum = policy.compact ? 14 : 28;
        if (points.length > maximum) points.splice(0, points.length - maximum);

        dustDistance += travel;
        const spacing = policy.compact ? 86 : 54;
        if (dustDistance >= spacing) {
            dustDistance %= spacing;
            dust.push({
                x: point.x + (Math.random() - 0.5) * 12,
                y: point.y + (Math.random() - 0.5) * 12,
                time: point.time,
                drift: (Math.random() - 0.5) * 12,
                radius: 1.7 + Math.random() * 1.5,
            });
            const maximumDust = policy.compact ? 3 : 6;
            if (dust.length > maximumDust) dust.shift();
        }
        frames.request(paint);
    }

    document.addEventListener('pointermove', track, passive);
    document.documentElement.addEventListener('pointerleave', () => { last = null; }, passive);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) reset();
    }, passive);
    window.addEventListener('blur', reset, passive);
    window.addEventListener('resize', () => {
        if (!canvas.hidden) sizeCanvas();
    }, passive);
    pointer.addEventListener('change', () => {
        if (!allowed()) reset();
    }, passive);

    const unsubscribe = settings.subscribe(next => {
        const compactChanged = policy.compact !== next.compact;
        policy = next;
        if (!allowed()) reset();
        else if (compactChanged && !canvas.hidden) sizeCanvas();
    });

    return () => {
        listeners.abort();
        unsubscribe?.();
        reset();
        canvas.remove();
    };
}
