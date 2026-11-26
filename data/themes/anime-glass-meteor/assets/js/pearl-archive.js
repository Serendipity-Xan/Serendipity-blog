(function () {
    const root = document.querySelector('[data-galaxy]');
    const articlesCfg = window.__AG_SITE_CONFIG__?.articles;
    if (articlesCfg && typeof articlesCfg === 'object') {
        const galaxyTitle = document.getElementById('ag-galaxy-title');
        if (galaxyTitle && typeof articlesCfg.title === 'string') {
            galaxyTitle.textContent = articlesCfg.title.trim();
        }
        const allBtnCfg = root?.querySelector('[data-galaxy-all]');
        if (allBtnCfg && typeof articlesCfg.allButtonText === 'string') {
            const txt = articlesCfg.allButtonText.trim();
            allBtnCfg.textContent = txt;
            allBtnCfg.hidden = !txt;
        }
        const archHeadingCfg = root?.querySelector('[data-arch-heading]');
        if (archHeadingCfg && typeof articlesCfg.archiveHeading === 'string') {
            const txt = articlesCfg.archiveHeading.trim();
            archHeadingCfg.textContent = txt;
            archHeadingCfg.hidden = !txt;
        }
    }

    const records = root?.querySelector('[data-galaxy-records]');
    const ui = root?.querySelector('[data-galaxy-interface]');
    if (!records || !ui) return;

    const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthsByKey = new Map();
    const seen = new Set();
    for (const record of records.querySelectorAll('[data-galaxy-record]')) {
        const link = record.querySelector('a[href]');
        const data = record.dataset;
        if (!link || !/^\d{4}-\d{2}$/.test(data.month) || seen.has(link.href)) continue;
        seen.add(link.href);

        if (!monthsByKey.has(data.month)) {
            const [year, month] = data.month.split('-').map(Number);
            monthsByKey.set(data.month, { label: year + ' · ' + month, name: MONTH_ABBR[month - 1] || String(month), entries: [] });
        }
        monthsByKey.get(data.month).entries.push({
            date: data.date,
            dateLabel: data.dateLabel,
            title: link.textContent.trim(),
            url: link.href,
            cover: data.cover,
            coverAlt: data.coverAlt,
            excerpt: data.excerpt,
            reading: data.reading,
            tags: Array.from(record.querySelector('template').content.children, tag => tag.textContent)
        });
    }
    const months = Array.from(monthsByKey.values(), month => {
        const daysByDate = new Map();
        for (const entry of month.entries) {
            if (!daysByDate.has(entry.date)) {
                daysByDate.set(entry.date, { date: entry.date, dateLabel: entry.dateLabel, entries: [] });
            }
            daysByDate.get(entry.date).entries.push(entry);
        }
        month.days = Array.from(daysByDate.values());
        return month;
    });
    if (!months.length) return;

    const find = name => ui.querySelector('[data-galaxy-' + name + ']');
    const chart = find('chart');
    const layer = find('points');
    const lines = find('links');
    const preview = find('preview');
    const beam = find('beam');
    const beamGradient = find('beam-gradient');
    const beamBody = find('beam-body');
    const beamRims = find('beam-rims');
    const beamAxis = find('beam-axis');
    const cover = find('cover');
    const title = find('title');
    const date = find('date');
    const excerpt = find('excerpt');
    const reading = find('reading');
    const tags = find('tags');
    const read = find('read');
    const stack = find('stack');
    const stackPosition = find('stack-position');
    const status = find('status');
    const pages = find('pages');
    const previous = find('prev');
    const next = find('next');
    const back = find('back');
    const space = 'http://www.w3.org/2000/svg';
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const turn = 2 * Math.PI;
    // One revolution in each view, in milliseconds.
    const overviewPeriod = 210000;
    const starPeriod = 140000;
    let overviewOffset = 0;
    let monthIndex = -1;
    let selectedDay = -1;
    let articleIndex = 0;
    let renderedKey = '';
    let nodePositions = [];
    let orbitNodes = [];
    let traces = [];
    let overviewAngle = 0;
    let starAngle = 0;
    let orbitFrame = 0;
    let lastOrbitTime;
    let chartVisible = !('IntersectionObserver' in window);
    let frame = 0;
    let beamFrame = 0;
    let beamGeometry;
    let lastDayWheel = -Infinity;
    let lastStackWheel = -Infinity;
    let hoverTimer = 0;
    let capacity = 1;
    let dayTracks = [];
    let activeTrack = 0;

    const TRACK_CONFIGS = [
        { tilt: -16 * Math.PI / 180, rxFactor: 0.96, ryFactor: 0.86, rotX: 7, rotY: -6, rotZ: -1.5, speedMul: 1 },
        { tilt: 22 * Math.PI / 180, rxFactor: 0.94, ryFactor: 0.78, rotX: -9, rotY: 11, rotZ: 2.2, speedMul: -0.78 },
        { tilt: 4 * Math.PI / 180, rxFactor: 0.76, ryFactor: 1.06, rotX: 12, rotY: 5, rotZ: 0.8, speedMul: 0.62 }
    ];

    const month = () => months[monthIndex];
    const day = () => month()?.days[selectedDay];
    const focused = () => monthIndex >= 0;
    const count = () => focused() ? month().days.length : months.length;

    function svgElement(tag, attributes) {
        const element = document.createElementNS(space, tag);
        for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
        return element;
    }

    function makeText(tag, className, text) {
        const element = document.createElement(tag);
        element.className = className;
        element.textContent = text;
        return element;
    }

    function createPlanet() {
        const planet = makeText('span', 'ag-galaxy-planet', '');
        planet.setAttribute('aria-hidden', 'true');
        planet.append(makeText('span', 'ag-galaxy-planet-surface', ''));
        return planet;
    }

    function createMonth(item, index) {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'ag-galaxy-node ag-galaxy-month';
        node.dataset.monthIndex = index;
        const label = makeText('span', 'ag-galaxy-label', '');
        label.append(makeText('b', '', item.label));
        node.append(createPlanet(), label);
        return node;
    }

    function createStar(group, index) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ag-galaxy-node ag-galaxy-star';
        button.dataset.dayIndex = index;
        button.setAttribute('aria-label', group.date + '，' + group.entries.length + ' 篇文章');
        button.setAttribute('aria-pressed', String(index === selectedDay));
        const icon = svgElement('svg', { viewBox:'0 0 48 48', 'aria-hidden':'true' });
        icon.append(svgElement('path', {
            d: 'M21 6Q24 0 27 6L31 15Q32 17 35 17L44 19Q49 20 45 24L38 31Q36 33 37 36L38 43Q39 48 34 45L26 41Q24 40 22 41L14 45Q9 48 10 43L11 36Q12 33 10 31L3 24Q-1 20 4 19L13 17Q16 17 17 15Z'
        }));
        const label = makeText('time', 'ag-galaxy-label', group.dateLabel);
        label.dateTime = group.date;
        button.append(icon, label);
        return button;
    }

    function showArticle(announce) {
        const group = day();
        const article = group.entries[articleIndex];
        const total = group.entries.length;
        title.textContent = article.title;
        date.dateTime = article.date;
        date.textContent = article.date;
        excerpt.hidden = !article.excerpt;
        excerpt.textContent = article.excerpt;
        reading.textContent = article.reading;
        tags.replaceChildren(...article.tags.map(tag => makeText('li', '', tag)));
        tags.hidden = !article.tags.length;
        read.href = article.url;
        cover.hidden = !article.cover;
        if (article.cover) {
            cover.alt = article.coverAlt || '';
            if (cover.getAttribute('src') !== article.cover) cover.src = article.cover;
        } else {
            cover.removeAttribute('src');
        }
        preview.dataset.galaxyStackDepth = Math.min(2, total - 1);
        stack.hidden = total < 2;
        stackPosition.textContent = (articleIndex + 1) + ' / ' + total;
        scheduleBeam();
        if (announce) {
            status.textContent = total > 1
                ? '第 ' + (articleIndex + 1) + ' 篇，共 ' + total + ' 篇：' + article.title
                : article.title;
        }
    }

    function selectDay(index, announce) {
        if (!month()?.days[index] || selectedDay === index) return;
        selectedDay = index;
        articleIndex = 0;
        lastStackWheel = -Infinity;
        for (const node of layer.querySelectorAll('[data-day-index]')) {
            node.setAttribute('aria-pressed', String(Number(node.dataset.dayIndex) === index));
        }
        const nextTrack = dayTracks[index] ?? 0;
        if (nextTrack !== activeTrack) {
            activeTrack = nextTrack;
            applyTrackHighlight();
        }
        showArticle(announce);
    }

    function moveArticle(direction) {
        const total = day()?.entries.length ?? 0;
        if (total < 2) return;
        clearTimeout(hoverTimer);
        articleIndex = (articleIndex + direction + total) % total;
        showArticle(true);
    }

    function applyTrackHighlight() {
        const cfg = TRACK_CONFIGS[activeTrack] || TRACK_CONFIGS[0];
        chart.style.setProperty('--galaxy-track-rx', cfg.rotX + 'deg');
        chart.style.setProperty('--galaxy-track-ry', cfg.rotY + 'deg');
        chart.style.setProperty('--galaxy-track-rz', cfg.rotZ + 'deg');
        for (const node of layer.querySelectorAll('[data-day-index]')) {
            const idx = Number(node.dataset.dayIndex);
            const isPrimary = (dayTracks[idx] ?? 0) === activeTrack;
            node.classList.toggle('is-secondary-track', !isPrimary);
        }
        const trackPaths = lines.querySelectorAll('.ag-galaxy-track[data-track-idx]');
        for (const p of trackPaths) {
            const isPrimary = Number(p.dataset.trackIdx) === activeTrack;
            p.classList.toggle('ag-galaxy-track-bright', isPrimary);
            p.classList.toggle('ag-galaxy-track-dim', !isPrimary);
        }
    }

    function placeNode(node, x, y) {
        node.style.setProperty('--galaxy-x', x.toFixed(2) + 'px');
        node.style.setProperty('--galaxy-y', y.toFixed(2) + 'px');
    }

    function paintOrbits() {
        const phase = focused() ? starAngle : overviewAngle;
        nodePositions = orbitNodes.map(({node, angle, centre, rx, ry, tilt = 0, speedMul = 1}) => {
            const a = angle + phase * speedMul;
            const ex = rx * Math.cos(a);
            const ey = ry * Math.sin(a);
            const x = centre.x + ex * Math.cos(tilt) - ey * Math.sin(tilt);
            const y = centre.y + ex * Math.sin(tilt) + ey * Math.cos(tilt);
            placeNode(node, x, y);
            return {x, y};
        });
        traces.forEach(({path, fromIdx, toIdx}) => {
            const from = nodePositions[fromIdx];
            const to = nodePositions[toIdx];
            if (!from || !to) return;
            const midX = (to.x + from.x) / 2;
            const midY = (to.y + from.y) / 2 - Math.min(24, Math.abs(to.x - from.x) * .1);
            path.setAttribute('d', `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`);
        });
        drawBeam();
    }

    function canAnimate() {
        return chartVisible && !document.hidden && !reducedMotion.matches;
    }

    function animateOrbits(now) {
        orbitFrame = 0;
        if (!canAnimate()) return;
        const lapse = lastOrbitTime === undefined ? 1000 / 30 : now - lastOrbitTime;
        if (lapse >= 31) {
            lastOrbitTime = now;
            // Screen Y grows downwards, so decreasing the phase moves counterclockwise.
            const time = Math.min(lapse, 100);
            if (focused()) starAngle = (starAngle - turn * time / starPeriod) % turn;
            else overviewAngle = (overviewAngle - turn * time / overviewPeriod) % turn;
            paintOrbits();
        }
        orbitFrame = requestAnimationFrame(animateOrbits);
    }

    function syncMotion() {
        root.toggleAttribute('data-galaxy-moving', canAnimate());
        if (canAnimate()) {
            if (!orbitFrame) orbitFrame = requestAnimationFrame(animateOrbits);
        } else {
            cancelAnimationFrame(orbitFrame);
            orbitFrame = 0;
            lastOrbitTime = undefined;
        }
    }

    function drawBeam() {
        const point = focused() && nodePositions[selectedDay];
        if (!point || !beamGeometry) {
            if (!beam.hasAttribute('hidden')) beam.setAttribute('hidden', '');
            return;
        }
        const {left, top: chartTop, endX, endY, spread} = beamGeometry;
        const startX = left + point.x;
        const startY = chartTop + point.y;
        const hub = [startX, startY].join(' ');
        const top = [endX, endY - spread].join(' ');
        const bottom = [endX, endY + spread].join(' ');

        beamGradient.setAttribute('x1', startX);
        beamGradient.setAttribute('y1', startY);
        beamBody.setAttribute('d', 'M ' + hub + ' L ' + top + ' L ' + bottom + ' Z');
        beamRims.setAttribute('d', 'M ' + top + ' L ' + hub + ' L ' + bottom);
        beamAxis.setAttribute('d', 'M ' + hub + ' L ' + endX + ' ' + endY);
        if (beam.hasAttribute('hidden')) beam.removeAttribute('hidden');
    }

    function measureBeam() {
        beamFrame = 0;
        beamGeometry = undefined;
        // Read layout only when the view or card size changes, independent of orbital frames.
        if (focused() && !preview.hidden && preview.offsetLeft > chart.offsetLeft) {
            const endX = preview.offsetLeft + 1;
            const endY = preview.offsetTop + preview.offsetHeight * .49;
            beamGeometry = {left: chart.offsetLeft, top: chart.offsetTop, endX, endY, spread: Math.min(preview.offsetHeight * .36, 112)};
            beam.setAttribute('viewBox', '0 0 ' + beam.parentElement.clientWidth + ' ' + beam.parentElement.clientHeight);
            beamGradient.setAttribute('x2', endX);
            beamGradient.setAttribute('y2', endY);
        }
        drawBeam();
    }

    function scheduleBeam() {
        if (!beamFrame) beamFrame = requestAnimationFrame(measureBeam);
    }

    function draw() {
        frame = 0;
        const width = chart.clientWidth;
        const height = chart.clientHeight;
        if (!width || !height) return;

        const nextCapacity = focused() ? month().days.length
            : width < 460 ? 3 : width < 780 ? 5 : 6;

        if (capacity !== nextCapacity) {
            capacity = nextCapacity;
            if (!focused()) {
                overviewOffset = Math.floor(overviewOffset / capacity) * capacity;
            }
        }

        const first = focused() ? 0 : overviewOffset;
        const length = Math.min(capacity, count() - first);
        const key = [monthIndex, first, length].join('/');
        if (key !== renderedKey) {
            const buttons = focused()
                ? month().days.map(createStar)
                : months.slice(first, first + length).map((entry, index) => createMonth(entry, first + index));
            if (focused()) {
                const core = document.createElement('div');
                core.className = 'ag-galaxy-core';
                core.setAttribute('aria-hidden', 'true');
                core.append(createPlanet(), makeText('strong', '', month().name));
                buttons.unshift(core);
            }
            layer.replaceChildren(...buttons);
            renderedKey = key;
        }

        const focus = focused();
        ui.dataset.galaxyDensity = focus ? (length >= 10 ? 'dense' : length >= 6 ? 'compact' : 'normal') : 'normal';
        const centre = {x: width * (focus ? .46 : .5), y: height * (focus ? .49 : .46)};
        const radiusX = focus
            ? Math.max(24, width * .45 - 12)
            : Math.max(24, width / 2 - 65);
        const radiusY = focus ? Math.min(height * .26, radiusX * .56)
            : Math.min(height * .33, radiusX * .75, 174);
        if (focus) placeNode(layer.firstElementChild, centre.x, centre.y);

        const paths = [];
        if (focus) {
            const trackBuckets = [[], [], []];
            dayTracks = month().days.map((group, index) => {
                // 每 10 号一条轨迹：1-10 号 -> 轨迹 0，11-20 号 -> 轨迹 1，21-31 号 -> 轨迹 2
                const dayNum = parseInt(group.date.slice(8, 10), 10) || 1;
                const tIdx = Math.min(2, Math.floor((dayNum - 1) / 10));
                trackBuckets[tIdx].push(index);
                return tIdx;
            });
            activeTrack = dayTracks[selectedDay] ?? 0;

            orbitNodes = new Array(length);
            trackBuckets.forEach((bucket, tIdx) => {
                const cfg = TRACK_CONFIGS[tIdx];
                const tRx = radiusX * cfg.rxFactor;
                const tRy = radiusY * cfg.ryFactor;
                const bLen = bucket.length || 1;
                bucket.forEach((itemIdx, posInTrack) => {
                    const angle = turn * posInTrack / bLen - Math.PI * .62;
                    orbitNodes[itemIdx] = {
                        node: layer.children[itemIdx + 1],
                        angle,
                        centre,
                        rx: tRx,
                        ry: tRy,
                        tilt: cfg.tilt,
                        speedMul: cfg.speedMul
                    };
                });
                const deg = (cfg.tilt * 180 / Math.PI).toFixed(2);
                const el = svgElement('ellipse', {
                    cx: centre.x,
                    cy: centre.y,
                    rx: tRx,
                    ry: tRy,
                    transform: `rotate(${deg} ${centre.x} ${centre.y})`,
                    'data-track-idx': String(tIdx),
                    class: tIdx === activeTrack ? 'ag-galaxy-track ag-galaxy-track-bright' : 'ag-galaxy-track ag-galaxy-track-dim'
                });
                paths.push(el);
            });

            const activeBucket = trackBuckets[activeTrack] || [];
            traces = activeBucket.slice(1).map((toIdx, i) => ({
                path: svgElement('path', {class: 'ag-galaxy-trace'}),
                fromIdx: activeBucket[i],
                toIdx
            }));
            lines.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
            lines.replaceChildren(...paths, ...traces.map(t => t.path));
            applyTrackHighlight();
        } else {
            dayTracks = [];
            chart.style.removeProperty('--galaxy-track-rx');
            chart.style.removeProperty('--galaxy-track-ry');
            chart.style.removeProperty('--galaxy-track-rz');
            const factors = length < 2 ? [1] : [1, .87];
            orbitNodes = Array.from({length}, (_, index) => {
                const angle = turn * index / length - Math.PI * .62;
                const factor = factors[index % factors.length];
                return {node: layer.children[index], angle, centre, rx: radiusX * factor, ry: radiusY * factor, tilt: 0, speedMul: 1};
            });
            for (const factor of factors) {
                paths.push(svgElement('ellipse', {cx:centre.x, cy:centre.y, rx:radiusX * factor, ry:radiusY * factor, class:'ag-galaxy-track'}));
            }
            traces = orbitNodes.slice(1).map((_, i) => ({
                path: svgElement('path', {class:'ag-galaxy-trace'}),
                fromIdx: i,
                toIdx: i + 1
            }));
            lines.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
            lines.replaceChildren(...paths, ...traces.map(t => t.path));
        }
        paintOrbits();
        scheduleBeam();

        const lastPage = Math.ceil(count() / capacity);
        pages.hidden = lastPage <= 1;
        find('page').textContent = (Math.floor(first / capacity) + 1) + ' / ' + lastPage;
        previous.disabled = first === 0;
        next.disabled = first + length >= count();
    }

    function scheduleDraw() {
        if (!frame) frame = requestAnimationFrame(draw);
    }

    function selectMonth(index, moveFocus, fromPopState) {
        if (!months[index] || focused()) return;
        clearTimeout(hoverTimer);
        monthIndex = index;
        starAngle = 0;
        selectedDay = -1;
        lastDayWheel = -Infinity;
        ui.classList.remove('is-returning');
        ui.classList.add('is-focused');
        chart.setAttribute('aria-label', month().label + ' 文章星轨');
        preview.hidden = false;
        if (back) {
            back.hidden = false;
            back.disabled = false;
        }
        if (!fromPopState) {
            const monthKey = (month().entries[0]?.date || '').slice(0, 7) || String(index);
            try { history.pushState({ galaxyMonth: index }, '', '#month-' + monthKey); } catch {}
        }
        const viewLabel = find('view');
        if (viewLabel) viewLabel.textContent = month().label;
        selectDay(0, false);
        status.textContent = month().label + '，共 ' + month().entries.length + ' 篇文章';
        draw();
        if (moveFocus) layer.querySelector('[data-day-index]')?.focus({preventScroll:true});
    }

    function resetView(moveFocus) {
        if (!focused()) return;
        clearTimeout(hoverTimer);
        const previousMonth = monthIndex;
        monthIndex = -1;
        selectedDay = -1;
        ui.classList.remove('is-focused');
        ui.classList.add('is-returning');
        chart.setAttribute('aria-label', '月份星图');
        preview.hidden = true;
        if (back) {
            back.hidden = true;
            back.disabled = true;
        }
        const viewLabel = find('view');
        if (viewLabel) viewLabel.textContent = '全景';
        status.textContent = '已返回月份全景';
        draw();
        if (moveFocus) (layer.querySelector('[data-month-index="' + previousMonth + '"]') || layer.firstElementChild)?.focus({preventScroll:true});
    }

    function movePage(direction) {
        const start = overviewOffset + capacity * direction;
        if (focused() || start < 0 || start >= count()) return;
        overviewOffset = start;
        draw();
        // Keep keyboard focus visible when the activated paging button was just disabled.
        if (document.activeElement?.disabled) (direction > 0 ? previous : next).focus({preventScroll:true});
    }

    chart.addEventListener('click', event => {
        const target = event.target.closest('button[data-month-index], button[data-day-index]');
        if (!target) return;
        clearTimeout(hoverTimer);
        if ('monthIndex' in target.dataset) selectMonth(Number(target.dataset.monthIndex), true);
        else selectDay(Number(target.dataset.dayIndex), true);
    });

    chart.addEventListener('focusin', event => {
        const index = event.target.dataset.dayIndex;
        if (index !== undefined) selectDay(Number(index), false);
    });

    chart.addEventListener('pointerover', event => {
        const node = event.target.closest('[data-day-index]');
        if (event.pointerType !== 'mouse' || !node || node.contains(event.relatedTarget)) return;
        if (performance.now() - lastDayWheel < 180) return;
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => selectDay(Number(node.dataset.dayIndex), false), 115);
    });
    chart.addEventListener('pointerout', event => {
        const node = event.target.closest('[data-day-index]');
        if (node && !node.contains(event.relatedTarget)) clearTimeout(hoverTimer);
    });

    chart.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
        const buttons = Array.from(layer.querySelectorAll('button'));
        const current = buttons.indexOf(event.target);
        if (current < 0) return;
        const direction = ['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1;
        event.preventDefault();
        buttons[(current + direction + buttons.length) % buttons.length].focus({preventScroll:true});
    });

    ui.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented || !focused()) return;
        event.preventDefault();
        resetView(true);
    });

    const isVerticalWheel = event => !event.ctrlKey && event.cancelable && Math.abs(event.deltaY) > Math.abs(event.deltaX);

    chart.addEventListener('wheel', event => {
        if (!focused() || !isVerticalWheel(event)) return;
        const total = count();
        if (total <= 1) return;
        // 向下滚动切换到更新的日期。
        const index = (selectedDay - Math.sign(event.deltaY) + total) % total;
        event.preventDefault();
        const now = performance.now();
        clearTimeout(hoverTimer);
        if (now - lastDayWheel < 180) return;
        lastDayWheel = now;
        const restoreFocus = layer.contains(document.activeElement);
        selectDay(index, true);
        if (restoreFocus) {
            layer.querySelector('[data-day-index="' + index + '"]')?.focus({preventScroll:true});
        }
    }, {passive:false});

    preview.addEventListener('wheel', event => {
        if (stack.hidden || !isVerticalWheel(event)) return;
        event.preventDefault();
        const now = performance.now();
        if (now - lastStackWheel < 180) return;
        lastStackWheel = now;
        moveArticle(Math.sign(event.deltaY));
    }, {passive:false});

    preview.addEventListener('keydown', event => {
        if (stack.hidden || event.altKey || event.ctrlKey || event.metaKey ||
            !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        moveArticle(event.key === 'ArrowRight' ? 1 : -1);
    });
    find('stack-prev').addEventListener('click', () => moveArticle(-1));
    find('stack-next').addEventListener('click', () => moveArticle(1));

    if (back) back.addEventListener('click', () => {
        if (history.state && history.state.galaxyMonth !== undefined) history.back();
        else resetView(true);
    });
    window.addEventListener('popstate', event => {
        if (event.state && typeof event.state.galaxyMonth === 'number') {
            if (!focused()) selectMonth(event.state.galaxyMonth, false, true);
        } else if (focused()) {
            resetView(false);
        }
    });
    previous.addEventListener('click', () => movePage(-1));
    next.addEventListener('click', () => movePage(1));
    cover.addEventListener('error', () => { cover.hidden = true; });

    // 全站文章：时间目录树 + 标签目录树
    const allBtn = root.querySelector('[data-galaxy-all]');
    const archView = root.querySelector('[data-arch-view]');
    const archBack = root.querySelector('[data-arch-back]');
    const timeTreeEl = root.querySelector('[data-arch-tree="time"]');
    const tagTreeEl = root.querySelector('[data-arch-tree="tag"]');

    if (allBtn && archView && timeTreeEl && tagTreeEl) {
        const allEntries = months.flatMap(m => m.entries);

        function makePostRow(entry, showTag) {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.className = 'ag-arch-post';
            a.href = entry.url;
            const timeEl = makeText('time', 'ag-arch-date', entry.date);
            timeEl.dateTime = entry.date;
            const titleEl = makeText('span', 'ag-arch-post-title', entry.title);
            a.append(timeEl, titleEl);
            if (showTag && entry.tags.length) {
                a.append(makeText('span', 'ag-arch-post-tag', '# ' + entry.tags[0]));
            }
            li.appendChild(a);
            return li;
        }

        // 1. 构建时间目录树（年 → 月 → 文章）
        const yearMap = new Map();
        for (const entry of allEntries) {
            const [y, m] = entry.date.split('-');
            if (!yearMap.has(y)) yearMap.set(y, new Map());
            const mMap = yearMap.get(y);
            const mKey = Number(m) + ' 月';
            if (!mMap.has(mKey)) mMap.set(mKey, []);
            mMap.get(mKey).push(entry);
        }
        const timeFrag = document.createDocumentFragment();
        for (const [year, mMap] of yearMap) {
            const yd = document.createElement('details');
            yd.className = 'ag-arch-group';
            yd.open = true;
            let yCount = 0;
            for (const list of mMap.values()) yCount += list.length;
            const ys = document.createElement('summary');
            ys.append(makeText('span', 'ag-arch-caret', ''), makeText('span', 'ag-arch-group-name', year + ' 年'), makeText('span', 'ag-arch-group-count', yCount + ' 篇'));
            yd.appendChild(ys);

            const mWrap = document.createElement('div');
            mWrap.className = 'ag-arch-children';
            for (const [mLabel, list] of mMap) {
                const md = document.createElement('details');
                md.className = 'ag-arch-subgroup';
                md.open = true;
                const ms = document.createElement('summary');
                ms.append(makeText('span', 'ag-arch-caret', ''), makeText('span', 'ag-arch-sub-name', mLabel), makeText('span', 'ag-arch-group-count', list.length + ' 篇'));
                md.appendChild(ms);
                const ul = document.createElement('ul');
                ul.className = 'ag-arch-post-list';
                list.forEach(entry => ul.appendChild(makePostRow(entry, true)));
                md.appendChild(ul);
                mWrap.appendChild(md);
            }
            yd.appendChild(mWrap);
            timeFrag.appendChild(yd);
        }
        timeTreeEl.appendChild(timeFrag);

        // 2. 构建标签目录树（标签 → 文章）
        const tagMap = new Map();
        for (const entry of allEntries) {
            const listTags = entry.tags.length ? entry.tags : ['未分类'];
            for (const t of listTags) {
                if (!tagMap.has(t)) tagMap.set(t, []);
                tagMap.get(t).push(entry);
            }
        }
        const sortedTags = Array.from(tagMap.entries()).sort((a, b) => b[1].length - a[1].length);
        const tagFrag = document.createDocumentFragment();
        for (const [tagName, list] of sortedTags) {
            const td = document.createElement('details');
            td.className = 'ag-arch-group';
            td.open = true;
            const ts = document.createElement('summary');
            ts.append(makeText('span', 'ag-arch-caret', ''), makeText('span', 'ag-arch-group-name', '# ' + tagName), makeText('span', 'ag-arch-group-count', list.length + ' 篇'));
            td.appendChild(ts);
            const ul = document.createElement('ul');
            ul.className = 'ag-arch-post-list ag-arch-children';
            list.forEach(entry => ul.appendChild(makePostRow(entry, false)));
            td.appendChild(ul);
            tagFrag.appendChild(td);
        }
        tagTreeEl.appendChild(tagFrag);

        let activeMode = 'time';
        const modeBtns = root.querySelectorAll('[data-arch-mode]');
        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                activeMode = btn.dataset.archMode;
                modeBtns.forEach(b => {
                    const act = b === btn;
                    b.classList.toggle('is-active', act);
                    b.setAttribute('aria-selected', String(act));
                });
                timeTreeEl.hidden = activeMode !== 'time';
                tagTreeEl.hidden = activeMode !== 'tag';
            });
        });

        root.querySelectorAll('[data-arch-fold]').forEach(btn => {
            btn.addEventListener('click', () => {
                const open = btn.dataset.archFold === 'expand';
                const targetTree = activeMode === 'time' ? timeTreeEl : tagTreeEl;
                targetTree.querySelectorAll('details').forEach(d => { d.open = open; });
            });
        });

        allBtn.addEventListener('click', () => {
            ui.hidden = true;
            archView.hidden = false;
        });
        archBack.addEventListener('click', () => {
            archView.hidden = true;
            ui.hidden = false;
            scheduleDraw();
        });
    }

    ui.hidden = false;
    try {
        draw();
    } catch (error) {
        ui.hidden = true;
        throw error;
    }
    records.remove();
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
            chartVisible = entry.isIntersecting;
            syncMotion();
        }).observe(chart);
    }
    reducedMotion.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
    syncMotion();
    if ('ResizeObserver' in window) {
        new ResizeObserver(scheduleDraw).observe(chart);
        new ResizeObserver(scheduleBeam).observe(preview);
    } else {
        window.addEventListener('resize', scheduleDraw, {passive:true});
    }
})();
