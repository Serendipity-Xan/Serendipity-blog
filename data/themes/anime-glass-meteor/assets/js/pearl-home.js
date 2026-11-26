(function () {
    'use strict';

    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const wide = matchMedia('(min-width: 961px)');
    const html = document.documentElement;
    const dialog = document.querySelector('[data-pearl-preview]');
    const canPreview = typeof dialog?.showModal === 'function';
    const ordinaryClick = (event) => !event.defaultPrevented && event.button === 0
        && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
    const wrap = (value, size) => ((value % size) + size) % size;
    const countLabel = (index) => String(index).padStart(2, '0');
    const relativePosition = (item, current, size) => {
        const half = Math.floor((size - 1) / 2);
        return wrap(item - current + half, size) - half;
    };
    let opener;
    let photoMode;

    if (canPreview) {
        dialog.querySelector('[data-pearl-close]').addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener('close', () => {
            dialog.querySelector('[data-pearl-media]').removeAttribute('src');
            const returnTarget = photoMode?.currentLink() || opener;
            photoMode = null;
            returnTarget?.focus({ preventScroll: true });
        });
        dialog.addEventListener('keydown', (event) => {
            if (!photoMode || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            photoMode.step(event.key === 'ArrowLeft' ? -1 : 1);
        });
        dialog.querySelectorAll('[data-pearl-preview-step]').forEach((button) => {
            button.addEventListener('click', () => photoMode?.step(Number(button.dataset.pearlPreviewStep)));
        });
    }

    function showPreview(link, title, excerpt, tags) {
        const source = link.querySelector('img');
        const image = dialog.querySelector('[data-pearl-media]');
        const description = dialog.querySelector('[data-pearl-preview-body]');
        const article = dialog.querySelector('[data-pearl-preview-link]');
        const tagList = dialog.querySelector('[data-pearl-preview-tags]');
        const src = photoMode ? link.href : source?.getAttribute('src');
        if (!dialog.open) opener = link;
        dialog.toggleAttribute('data-pearl-photo-preview', Boolean(photoMode));
        dialog.querySelector('h2').textContent = title;
        image.hidden = !src;
        image.alt = photoMode ? title : source?.alt || '';
        if (src) image.src = src;
        description.textContent = excerpt;
        description.hidden = !excerpt;
        tagList.replaceChildren(...(tags ? [...tags.children].map((tag) => tag.cloneNode(true)) : []));
        tagList.hidden = !tagList.children.length;
        article.href = link.href;
        article.hidden = Boolean(photoMode);
        dialog.querySelector('[data-pearl-preview-photos]').hidden = !photoMode;
        if (photoMode) dialog.querySelector('[data-pearl-preview-position]').textContent = photoMode.position();
        if (!dialog.open) dialog.showModal();
    }

    // One step per short wheel gesture. Sustained gestures escape to the page,
    // even when the pointer remains on the carousel and the ring never ends.
    function wheelStep(surface, available, step) {
        let started = 0;
        let last = 0;
        let momentum = 0;
        let direction = 0;
        let handled = false;
        surface.addEventListener('wheel', (event) => {
            if (!available() || event.ctrlKey || event.metaKey || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            const now = performance.now();
            const nextDirection = Math.sign(event.deltaY);
            if (!nextDirection) return;
            if (!last || now - last > 180 || nextDirection !== direction) {
                started = now;
                momentum = 0;
                handled = false;
            }
            last = now;
            direction = nextDirection;
            if (now - started > 250 || !event.cancelable) return;
            event.preventDefault();
            if (handled) return;
            const multiplier = event.deltaMode === 1 ? 18 : (event.deltaMode === 2 ? surface.clientHeight : 1);
            momentum += Math.abs(event.deltaY) * multiplier;
            if (momentum >= 35) {
                step(direction);
                handled = true;
            }
        }, { passive: false });
    }

    function pointerDrag(surface, isAvailable, handlers) {
        let drag;
        let ignoreClickUntil = 0;
        let frame = 0;
        let pendingDelta = 0;
        surface.addEventListener('dragstart', (event) => event.preventDefault());
        surface.addEventListener('pointerdown', (event) => {
            if (!isAvailable() || !event.isPrimary || event.button !== 0) return;
            const scale = Number(getComputedStyle(surface).getPropertyValue('--ag-page-scale')) || 1;
            drag = { id: event.pointerId, x: event.clientX, y: event.clientY, last: event.clientX, time: performance.now(), velocity: 0, moved: false, scale };
        });
        surface.addEventListener('pointermove', (event) => {
            if (!drag || drag.id !== event.pointerId || !isAvailable()) return;
            const delta = (event.clientX - drag.x) / drag.scale;
            if (!drag.moved) {
                const y = Math.abs(event.clientY - drag.y) / drag.scale;
                if (y >= 10 && y > Math.abs(delta)) { drag = null; return; }
                if (Math.abs(delta) < 10) return;
                surface.setPointerCapture(event.pointerId);
                surface.setAttribute('data-pearl-dragging', '');
                drag.moved = true;
            }
            const now = performance.now();
            drag.velocity = clamp((event.clientX - drag.last) / drag.scale / Math.max(1, now - drag.time), -2.3, 2.3);
            drag.last = event.clientX;
            drag.time = now;
            pendingDelta = delta;
            if (!frame) frame = requestAnimationFrame(() => {
                frame = 0;
                handlers.move(pendingDelta);
            });
        });
        function finish(event) {
            if (!drag || drag.id !== event.pointerId) return;
            // Touch starts with implicit capture on the photo. Its capture loss
            // bubbles when capture moves to the rail, while the gesture continues.
            if (event.type === 'lostpointercapture' && event.target !== surface) return;
            cancelAnimationFrame(frame);
            frame = 0;
            surface.removeAttribute('data-pearl-dragging');
            if (drag.moved) {
                ignoreClickUntil = performance.now() + 280;
                const released = event.type === 'pointerup';
                handlers.end(released ? (event.clientX - drag.x) / drag.scale : 0, released && performance.now() - drag.time < 75 ? drag.velocity : 0);
            }
            drag = null;
        }
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) surface.addEventListener(name, finish);
        window.addEventListener('pointerup', finish);
        surface.addEventListener('click', (event) => {
            if (event.detail && performance.now() < ignoreClickUntil) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);
    }

    function mountOrbit(feature) {
        const orbit = feature.querySelector('[data-pearl-orbit]');
        const strip = orbit.querySelector('[data-pearl-orbit-cards]');
        const controls = orbit.querySelector('[data-pearl-orbit-controls]');
        const steps = [...controls.querySelectorAll('[data-pearl-step]')];
        const cards = [...strip.querySelectorAll('[data-pearl-card]')];
        const stories = [...feature.querySelectorAll('[data-pearl-story]')];
        if (!cards.length || stories.length !== cards.length) return;
        const titles = stories.map((story) => story.querySelector('h3').textContent.trim());
        const status = feature.querySelector('[data-pearl-orbit-status]');
        const counter = controls.querySelector('[data-pearl-orbit-count]');
        let index = 0;
        let spatial = false;
        let radius = 170;
        let cell = 200;
        let settleTimer = 0;
        orbit.dataset.pearlReady = '';
        stories.forEach((_, item) => {
            stories[item].querySelector('.pearl-story-number').textContent = countLabel(item + 1);
        });

        function stagePositions(previous = index) {
            cards.forEach((card, item) => {
                const offset = relativePosition(item, index, cards.length);
                const prior = relativePosition(item, previous, cards.length);
                const distance = Math.abs(offset);
                const theta = clamp(offset, -3, 3) * 0.54;
                // The furthest card wraps behind the stack without flying across the front.
                card.toggleAttribute('data-pearl-seam', Math.abs(offset - prior) > 2);
                card.style.setProperty('--orbit-x', Math.round(Math.sin(theta) * radius) + 'px');
                card.style.setProperty('--orbit-y', Math.round((1 - Math.cos(theta)) * 67 - Math.sin(theta) * 43) + 'px');
                card.style.setProperty('--orbit-z', -distance * 60 + 'px');
                card.style.setProperty('--orbit-rotate', -Math.sin(theta) * 23 + 'deg');
                card.style.setProperty('--orbit-scale', Math.max(.76, 1 - distance * .065));
                card.style.setProperty('--orbit-opacity', String(Math.max(.34, 1 - distance * .21)));
                card.style.setProperty('--orbit-flat-x', offset * cell + 'px');
                card.style.setProperty('--orbit-order', String(cards.length - distance));
                card.tabIndex = offset === 0 ? 0 : -1;
            });
        }

        function select(next, force = false) {
            next = wrap(next, cards.length);
            if (next === index && !force) return;
            const previous = index;
            if (spatial && !force) {
                // Sample the backdrop only after the cards have stopped orbiting.
                orbit.setAttribute('data-pearl-orbit-moving', '');
                clearTimeout(settleTimer);
                settleTimer = setTimeout(() => orbit.removeAttribute('data-pearl-orbit-moving'), 590);
            }
            index = next;
            cards.forEach((card, item) => {
                const active = item === index;
                card.toggleAttribute('data-pearl-active', active);
                stories[item].hidden = !active;
                stories[item].toggleAttribute('data-pearl-reveal', active && !force && html.hasAttribute('data-ag-card-tilt'));
            });
            counter.textContent = countLabel(index + 1) + ' / ' + countLabel(cards.length);
            if (!force) status.textContent = titles[index];
            stagePositions(previous);
        }

        function layout() {
            spatial = wide.matches && fine.matches && !motion.matches && html.hasAttribute('data-ag-card-tilt');
            orbit.setAttribute('data-pearl-resizing', '');
            orbit.toggleAttribute('data-pearl-3d', spatial);
            radius = clamp(orbit.clientWidth * .31, 136, 235);
            cell = cards[0].offsetWidth + 12;
            stagePositions();
            requestAnimationFrame(() => orbit.removeAttribute('data-pearl-resizing'));
        }

        wheelStep(strip, () => fine.matches && cards.length > 1, (direction) => select(index + direction));
        orbit.addEventListener('keydown', (event) => {
            if (cards.length < 2 || event.ctrlKey || event.metaKey || event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            select(index + (event.key === 'ArrowLeft' ? -1 : 1));
            if (event.target.closest('[data-pearl-card]')) cards[index].focus({ preventScroll: true });
        });
        cards.forEach((card, item) => card.addEventListener('click', (event) => {
            if (!ordinaryClick(event)) return;
            if (item !== index) {
                event.preventDefault();
                select(item);
            } else if (canPreview) {
                event.preventDefault();
                const story = stories[item];
                showPreview(card, titles[item], story.querySelector('.pearl-story-excerpt').textContent.trim(), story.querySelector('.pearl-story-tags'));
            }
        }));
        steps.forEach((button) => button.addEventListener('click', () => select(index + Number(button.dataset.pearlStep))));
        pointerDrag(strip, () => cards.length > 1, {
            move: (delta) => strip.style.setProperty('--orbit-drag', clamp(delta, -cell, cell) + 'px'),
            end: (delta, velocity) => {
                strip.style.removeProperty('--orbit-drag');
                const distance = delta + velocity * 74;
                if (Math.abs(distance) >= 36) select(index - Math.sign(distance));
            }
        });

        new MutationObserver(layout).observe(html, { attributes: true, attributeFilter: ['data-ag-card-tilt'] });
        if ('ResizeObserver' in window) new ResizeObserver(layout).observe(orbit);
        else window.addEventListener('resize', layout, { passive: true });
        for (const query of [wide, fine, motion]) query.addEventListener('change', layout);
        controls.hidden = cards.length < 2;
        layout();
        select(0, true);
    }

    function mountGallery(strip) {
        const panels = [...strip.querySelectorAll('.pearl-gallery-panel')];
        const controls = document.querySelector('[data-pearl-photo-controls]');
        const buttons = [...controls.querySelectorAll('[data-pearl-photo-step]')];
        if (!panels.length) return;
        const links = panels.map((panel) => panel.querySelector('[data-pearl-photo]'));
        let center = Math.floor(panels.length / 2);
        let cell = 200;
        strip.dataset.pearlReady = '';

        function placePanels(previous = center) {
            panels.forEach((panel, item) => {
                const offset = relativePosition(item, center, panels.length);
                const prior = relativePosition(item, previous, panels.length);
                const distance = Math.abs(offset);
                panel.toggleAttribute('data-pearl-seam', Math.abs(offset - prior) > 2);
                panel.toggleAttribute('data-pearl-centered', !offset);
                panel.style.setProperty('--photo-x', offset * cell + 'px');
                panel.style.setProperty('--photo-order', panels.length - distance);
                panel.style.setProperty('--photo-opacity', Math.max(.65, 1 - distance * .16));
                panel.style.setProperty('--photo-rise', Math.min(35, distance ** 2 * 10) + 'px');
                panel.style.setProperty('--photo-turn', clamp(-offset * 13, -28, 28) + 'deg');
                panel.style.setProperty('--photo-roll', clamp(offset * 5, -12, 12) + 'deg');
                panel.style.setProperty('--photo-scale', Math.max(.83, 1 - distance * .075));
                panel.style.setProperty('--photo-mist', Math.min(.72, distance * .28));
                links[item].tabIndex = offset === 0 ? 0 : -1;
            });
        }

        function select(next) {
            const previous = center;
            center = wrap(next, panels.length);
            if (center !== previous) placePanels(previous);
        }
        function measure() {
            const width = panels[0].offsetWidth;
            cell = wide.matches && fine.matches && !motion.matches ? width * .84 : width + 10;
            placePanels();
        }

        buttons.forEach((button) => button.addEventListener('click', () => select(center + Number(button.dataset.pearlPhotoStep))));
        wheelStep(strip, () => fine.matches && panels.length > 1, (direction) => select(center + direction));
        pointerDrag(strip, () => panels.length > 1, {
            move: (delta) => strip.style.setProperty('--photo-drag', clamp(delta, -cell, cell) + 'px'),
            end: (delta, velocity) => {
                strip.style.removeProperty('--photo-drag');
                const distance = delta + velocity * 110;
                if (Math.abs(distance) >= 40) select(center - Math.sign(distance));
            }
        });
        strip.addEventListener('keydown', (event) => {
            if (panels.length < 2 || event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            select(center + (event.key === 'ArrowLeft' ? -1 : 1));
            links[center].focus({ preventScroll: true });
        });
        if (canPreview) {
            function showPhoto() {
                const link = links[center];
                showPreview(link, link.querySelector('img').alt, '');
            }
            strip.addEventListener('click', (event) => {
                const link = event.target.closest('[data-pearl-photo]');
                if (!link || !ordinaryClick(event)) return;
                event.preventDefault();
                select(links.indexOf(link));
                photoMode = {
                    currentLink: () => links[center],
                    position: () => countLabel(center + 1) + ' / ' + countLabel(panels.length),
                    step: (direction) => {
                        select(center + direction);
                        showPhoto();
                    }
                };
                showPhoto();
            });
        }
        if ('ResizeObserver' in window) new ResizeObserver(measure).observe(strip);
        else window.addEventListener('resize', measure, { passive: true });
        for (const query of [wide, fine, motion]) query.addEventListener('change', measure);
        controls.hidden = panels.length < 2;
        measure();
    }

    function mountDock(dock) {
        const links = [...dock.querySelectorAll('.pearl-dock-link')];
        if (!links.length) return;
        const icons = links.map((link) => link.querySelector('.pearl-dock-icon'));
        let centers = [];
        let x;
        let frame = 0;
        function paintDock() {
            frame = 0;
            icons.forEach((icon, index) => {
                const delta = x === undefined ? 150 : x - centers[index];
                const strength = (1 - Math.min(1, Math.abs(delta) / 92)) ** 2;
                icon.style.setProperty('--dock-x', clamp(delta * strength * .32, -9, 9) + 'px');
                icon.style.setProperty('--dock-y', -12 * strength + 'px');
                icon.style.setProperty('--dock-scale', 1 + .29 * strength);
            });
        }
        const queue = () => { if (!frame) frame = requestAnimationFrame(paintDock); };
        dock.addEventListener('pointerenter', () => {
            centers = links.map((link) => { const box = link.getBoundingClientRect(); return box.left + box.width * .5; });
        });
        dock.addEventListener('pointermove', (event) => {
            if (event.pointerType !== 'mouse' || motion.matches || !html.hasAttribute('data-ag-card-tilt')) return;
            x = event.clientX;
            queue();
        }, { passive: true });
        dock.addEventListener('pointerleave', () => { x = undefined; queue(); });
        dock.addEventListener('pointerdown', (event) => {
            if (motion.matches || !html.hasAttribute('data-ag-card-tilt')) return;
            const icon = event.target.closest('.pearl-dock-link')?.querySelector('.pearl-dock-icon');
            if (!icon) return;
            const wave = document.createElement('i');
            wave.className = 'pearl-dock-wave';
            icon.append(wave);
            wave.addEventListener('animationend', () => wave.remove(), { once: true });
        });
    }

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const DOCK_ICONS = {
        terminal: [
            ['rect', { x: '3', y: '5', width: '18', height: '14', rx: '3' }],
            ['path', { d: 'm7 9 3 3-3 3m6 0h4' }]
        ],
        globe: [
            ['circle', { cx: '12', cy: '12', r: '8' }],
            ['ellipse', { cx: '12', cy: '12', rx: '3.5', ry: '8' }],
            ['path', { d: 'M4 12h16' }]
        ],
        book: [
            ['path', { d: 'M12 6a8 8 0 0 0-8-1v13a8 8 0 0 1 8 1 8 8 0 0 1 8-1V5a8 8 0 0 0-8 1Zm0 0v13' }]
        ],
        link: [
            ['path', { d: 'm9 15 6-6m-4-1 3-3a4 4 0 0 1 5 5l-3 3m-3 3-3 3a4 4 0 0 1-5-5l3-3' }]
        ],
        wrench: [
            ['path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5.5 5.5 0 0 1-7.4 7.4l-6.6 6.6a2.1 2.1 0 0 1-3-3l6.6-6.6a5.5 5.5 0 0 1 7.4-7.4z' }]
        ],
        code: [
            ['path', { d: 'm8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16' }]
        ],
        sparkles: [
            ['path', { d: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z' }],
            ['path', { d: 'M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z' }]
        ],
        compass: [
            ['circle', { cx: '12', cy: '12', r: '9' }],
            ['polygon', { points: '16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9 16.2 7.8' }]
        ]
    };

    function createDockIcon(name) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.5');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const shapes = DOCK_ICONS[name] || DOCK_ICONS.sparkles;
        for (const [tag, attrs] of shapes) {
            const node = document.createElementNS(SVG_NS, tag);
            for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
            svg.appendChild(node);
        }
        return svg;
    }

    function safeHref(raw) {
        const value = String(raw || '').trim();
        if (!value) return '#';
        if ((value.startsWith('/') && !value.startsWith('//')) || value.startsWith('#')) return value;
        try {
            const u = new URL(value);
            if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') return u.href;
        } catch {}
        return '#';
    }

    function setOptionalText(el, val) {
        if (!el || typeof val !== 'string') return;
        const trimmed = val.trim();
        el.textContent = trimmed;
        el.hidden = !trimmed;
    }

    function setLinkTextPreservingIcon(anchor, val) {
        if (!anchor || typeof val !== 'string') return;
        const text = val.trim();
        const icon = anchor.querySelector('svg');
        anchor.textContent = text ? text + ' ' : '';
        if (icon) anchor.appendChild(icon);
        anchor.hidden = !text;
    }

    function applySiteConfig() {
        const cfg = window.__AG_SITE_CONFIG__;
        if (!cfg || typeof cfg !== 'object') return;

        const hero = cfg.hero;
        if (hero && typeof hero === 'object') {
            setOptionalText(document.getElementById('ag-home-title'), hero.title);
            setOptionalText(document.querySelector('.ag-home-sub'), hero.subtitle);
            const badgeEl = document.getElementById('pearl-hero-badge');
            if (badgeEl && typeof hero.badge === 'string') {
                const badgeText = hero.badge.trim();
                badgeEl.textContent = badgeText;
                badgeEl.hidden = !badgeText;
                const heroSec = document.querySelector('.pearl-hero');
                if (heroSec) {
                    if (badgeText) heroSec.setAttribute('aria-describedby', 'pearl-hero-badge');
                    else heroSec.removeAttribute('aria-describedby');
                }
            }
            setOptionalText(document.querySelector('.pearl-vertical-note'), hero.sideNote);
            const scrollEl = document.querySelector('.pearl-hero-action');
            if (scrollEl && typeof hero.scrollLabel === 'string') {
                const label = hero.scrollLabel.trim();
                if (label) scrollEl.setAttribute('aria-label', label);
                else scrollEl.removeAttribute('aria-label');
            }
        }

        const home = cfg.home;
        if (home && typeof home === 'object') {
            setOptionalText(document.getElementById('pearl-issue-title'), home.articlesTitle);
            setLinkTextPreservingIcon(document.querySelector('[data-pearl-articles-more]'), home.articlesMoreText);
            setOptionalText(document.getElementById('pearl-photo-title'), home.lifeTitle);
            setOptionalText(document.getElementById('pearl-dock-title'), home.toolboxTitle);
            setLinkTextPreservingIcon(document.querySelector('[data-pearl-toolbox-more]'), home.toolboxMoreText);

            if (Array.isArray(home.galleryPhotos)) {
                const photoSection = document.querySelector('.pearl-photo-section');
                const galleryEl = document.querySelector('[data-pearl-gallery]');
                const validPhotos = home.galleryPhotos.filter((p) => {
                    if (!p || !String(p.url || '').trim()) return false;
                    return safeHref(p.url) !== '#';
                });
                if (galleryEl) {
                    galleryEl.replaceChildren();
                    if (!validPhotos.length) {
                        if (photoSection) photoSection.hidden = true;
                    } else {
                        if (photoSection) photoSection.hidden = false;
                        const frag = document.createDocumentFragment();
                        validPhotos.forEach((p) => {
                            const url = safeHref(p.url);
                            const caption = String(p.caption || '').trim();
                            const alt = String(p.alt || caption).trim();
                            const fig = document.createElement('figure');
                            fig.className = 'pearl-gallery-panel';
                            const a = document.createElement('a');
                            a.href = url;
                            a.setAttribute('data-pearl-photo', '');
                            const img = document.createElement('img');
                            img.src = url;
                            img.alt = alt;
                            img.loading = 'eager';
                            img.decoding = 'async';
                            img.width = 375;
                            img.height = 500;
                            a.appendChild(img);
                            fig.appendChild(a);
                            if (caption) {
                                const cap = document.createElement('figcaption');
                                cap.textContent = caption;
                                fig.appendChild(cap);
                            }
                            frag.appendChild(fig);
                        });
                        galleryEl.appendChild(frag);
                    }
                }
            }

            if (Array.isArray(home.toolboxDock)) {
                const dockSection = document.querySelector('.pearl-dock-section');
                const dockEl = document.querySelector('[data-pearl-dock]');
                const validDock = home.toolboxDock.filter((d) => d && String(d.label || '').trim() && String(d.href || '').trim());
                if (dockEl) {
                    dockEl.replaceChildren();
                    if (!validDock.length) {
                        if (dockSection) dockSection.hidden = true;
                    } else {
                        if (dockSection) dockSection.hidden = false;
                        const frag = document.createDocumentFragment();
                        validDock.forEach((item) => {
                            const href = safeHref(item.href);
                            const a = document.createElement('a');
                            a.className = 'pearl-dock-link';
                            a.href = href;
                            if (/^https?:\/\//i.test(href)) {
                                try {
                                    if (new URL(href).origin !== location.origin) {
                                        a.target = '_blank';
                                        a.rel = 'noopener noreferrer';
                                    }
                                } catch {}
                            }
                            const iconWrap = document.createElement('span');
                            iconWrap.className = 'pearl-dock-icon';
                            iconWrap.setAttribute('aria-hidden', 'true');
                            iconWrap.appendChild(createDockIcon(String(item.icon || '').trim()));
                            const labelSpan = document.createElement('span');
                            labelSpan.textContent = String(item.label).trim();
                            a.append(iconWrap, labelSpan);
                            frag.appendChild(a);
                        });
                        dockEl.appendChild(frag);
                    }
                }
            }
        }
    }

    applySiteConfig();

    const feature = document.querySelector('[data-pearl-feature]');
    const gallery = document.querySelector('[data-pearl-gallery]');
    const dock = document.querySelector('[data-pearl-dock]');
    if (feature) mountOrbit(feature);
    if (gallery && !gallery.closest('[hidden]')) mountGallery(gallery);
    if (dock && !dock.closest('[hidden]')) mountDock(dock);
}());
