/* 友链双模式交互引擎：方案 B 实时物理不规则星座 ↔ 星月关系图谱 */
(function () {
    'use strict';

    const stage = document.getElementById('ag-graph-stage');
    const canvas = document.getElementById('ag-graph-canvas');
    const ctx = canvas?.getContext('2d');
    const overlay = document.getElementById('ag-const-overlay');
    const svg = document.getElementById('ag-graph-svg');
    const records = document.getElementById('ag-links-records');
    const card = document.getElementById('ag-graph-card');
    const hudTitle = document.getElementById('ag-graph-hud-title');
    const hudSub = document.getElementById('ag-graph-hud-sub');
    const btnBack = document.getElementById('ag-const-back');
    const btnAll = document.getElementById('ag-const-all');
    const btnReset = document.getElementById('ag-graph-reset');
    const modeTabs = [...document.querySelectorAll('[data-links-mode]')];
    if (!stage || !canvas || !ctx || !overlay || !svg) return;

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

    const EMPTY_LINKS_TEXT = '还没有添加友链，请在中文管理台「友链管理」中添加';
    const siteCfg = window.__AG_SITE_CONFIG__ || {};
    const linksCfg = siteCfg.links;
    if (hudTitle && typeof linksCfg?.hudTitle === 'string') {
        const titleText = linksCfg.hudTitle.trim();
        hudTitle.textContent = titleText;
        hudTitle.hidden = !titleText;
    }
    const hasCustomHudSub = typeof linksCfg?.hudSub === 'string';
    const defaultNetworkHudSub = hasCustomHudSub
        ? linksCfg.hudSub.trim()
        : '星月图谱：中心明月串联友链 · 发光圆点为分类 · 悬停/点击星星显现站点图标';
    const hubDesc = (siteCfg.hero?.subtitle && String(siteCfg.hero.subtitle).trim()) || '';

    const NS = 'http://www.w3.org/2000/svg';
    const MODE_KEY = 'ag-links-view-v2';
    const STAR_PALETTE = [
        { stops: ['#eef4ff', '#8fa8ff', '#5d73d6'], bg: 'radial-gradient(circle at 32% 30%, #eef4ff, #7d9eff 58%, #4d67cc)', glow: 'rgba(130, 165, 255, .85)' },
        { stops: ['#f6e6ff', '#c29bff', '#8862cf'], bg: 'radial-gradient(circle at 32% 30%, #f8e8ff, #be92ff 58%, #835ad1)', glow: 'rgba(195, 148, 255, .85)' },
        { stops: ['#ffe8e2', '#ffa696', '#cf726a'], bg: 'radial-gradient(circle at 32% 30%, #ffeae4, #ff9f94 58%, #cc6d68)', glow: 'rgba(255, 166, 152, .85)' },
        { stops: ['#dff8ff', '#74d2ff', '#4598cc'], bg: 'radial-gradient(circle at 32% 30%, #e0f9ff, #6fd2ff 58%, #3c98c9)', glow: 'rgba(116, 214, 255, .85)' },
        { stops: ['#e2fff6', '#76dfc4', '#419e88'], bg: 'radial-gradient(circle at 32% 30%, #e4fff6, #74dfc2 58%, #3d9e86)', glow: 'rgba(122, 228, 198, .85)' },
        { stops: ['#fff4d8', '#ffd28a', '#c99345'], bg: 'radial-gradient(circle at 32% 30%, #fff4dc, #ffd188 58%, #c99242)', glow: 'rgba(255, 210, 138, .85)' }
    ];
    const CLUSTER_THEMES = [
        { suffix: '天琴', cx: 0.22, cy: 0.34, shape: [[-0.07, -0.06], [0.05, -0.02], [-0.01, 0.06], [-0.08, 0.04]] },
        { suffix: '仙后', cx: 0.50, cy: 0.27, shape: [[-0.08, -0.05], [-0.01, 0.03], [0.05, -0.04], [0.09, 0.05]] },
        { suffix: '天鹅', cx: 0.78, cy: 0.36, shape: [[-0.06, -0.06], [0.01, 0.00], [0.07, -0.05], [-0.02, 0.07]] },
        { suffix: '猎户', cx: 0.33, cy: 0.69, shape: [[-0.07, -0.05], [0.03, -0.05], [0.06, 0.04], [-0.03, 0.07]] },
        { suffix: '南十字', cx: 0.69, cy: 0.69, shape: [[-0.06, 0.02], [0.01, -0.06], [0.07, 0.03], [0.00, 0.07]] }
    ];
    const isImageIcon = (val) => /^(https?:|data:image\/(png|jpe?g|gif|webp|svg\+xml|avif|x-icon)|\/(?!\/)|\.)/i.test(val || '');

    const siteBrand = document.querySelector('.ag-brand-text strong');
    const hubName = (siteBrand && siteBrand.textContent.trim()) || 'Serendipity';

    const friends = Array.isArray(linksCfg?.friends)
        ? linksCfg.friends
            .filter(item => item && String(item.name || '').trim())
            .map((item, i) => {
                const label = String(item.name || '').trim();
                const rawTags = Array.isArray(item.tags)
                    ? item.tags.map(t => String(t || '').trim()).filter(Boolean)
                    : String(item.tags || '').split(',').map(s => s.trim()).filter(Boolean);
                const tags = rawTags.length ? rawTags : ['友链'];
                const icon = String(item.icon || '').trim();
                const glyph = label.replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '').slice(0, 1).toUpperCase() || '✦';
                const palIdx = i % STAR_PALETTE.length;
                return {
                    id: String(item.id || ('f-' + i)),
                    label,
                    desc: String(item.desc || '').trim(),
                    url: safeHref(item.url),
                    tags,
                    cluster: String(item.cluster || tags[0] || '深空').trim(),
                    icon,
                    glyph,
                    palIdx,
                    pal: STAR_PALETTE[palIdx]
                };
            })
        : (records ? [...records.querySelectorAll('.ag-friend')].map((a, i) => {
            const nameEl = a.querySelector('b');
            const descEl = a.querySelector('em');
            const label = nameEl ? nameEl.textContent.trim() : a.textContent.trim();
            const tags = (a.dataset.tags || '友链').split(',').map(s => s.trim()).filter(Boolean);
            const icon = (a.dataset.icon || '').trim();
            const glyph = label.replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '').slice(0, 1).toUpperCase() || '✦';
            const palIdx = i % STAR_PALETTE.length;
            return {
                id: 'f-' + i,
                label,
                desc: descEl ? descEl.textContent.trim() : '',
                url: safeHref(a.getAttribute('href')),
                tags,
                cluster: (a.dataset.cluster || tags[0] || '深空').trim(),
                icon,
                glyph,
                palIdx,
                pal: STAR_PALETTE[palIdx]
            };
        }) : []);

    let emptyBanner = null;
    if (!friends.length) {
        emptyBanner = document.createElement('div');
        emptyBanner.className = 'ag-links-empty';
        emptyBanner.id = 'ag-links-empty';
        emptyBanner.setAttribute('role', 'status');
        emptyBanner.textContent = EMPTY_LINKS_TEXT;
        stage.appendChild(emptyBanner);
    }

    /* ================= 共用无框透明详情卡 ================= */
    let hideCardTimer = 0;
    const cardIconImg = document.getElementById('ag-graph-card-icon');
    if (cardIconImg) {
        cardIconImg.addEventListener('error', () => {
            cardIconImg.hidden = true;
            cardIconImg.removeAttribute('src');
        });
    }
    function openCard(f) {
        if (!card) return;
        clearTimeout(hideCardTimer);
        if (cardIconImg) {
            if (isImageIcon(f.icon)) { cardIconImg.src = f.icon; cardIconImg.hidden = false; }
            else { cardIconImg.hidden = true; cardIconImg.removeAttribute('src'); }
        }
        document.getElementById('ag-graph-card-title').textContent = f.label;
        const hostEl = document.getElementById('ag-graph-card-host');
        if (hostEl) {
            try { hostEl.textContent = new URL(f.url).hostname; } catch { hostEl.textContent = f.url; }
        }
        document.getElementById('ag-graph-card-desc').textContent = f.desc;
        const tagsWrap = document.getElementById('ag-graph-card-tags');
        tagsWrap.innerHTML = '';
        f.tags.forEach(t => {
            const sp = document.createElement('span');
            sp.className = 'ag-graph-card-tag';
            sp.textContent = '# ' + t;
            tagsWrap.appendChild(sp);
        });
        const visitLink = document.getElementById('ag-graph-card-visit');
        if (visitLink) {
            const cleanUrl = safeHref(f.url);
            visitLink.href = cleanUrl;
            visitLink.hidden = cleanUrl === '#';
        }
        card.hidden = false;
    }
    function closeCard() {
        clearTimeout(hideCardTimer);
        if (card) card.hidden = true;
    }
    function scheduleCloseCard(pinned) {
        if (pinned) return;
        clearTimeout(hideCardTimer);
        hideCardTimer = setTimeout(() => {
            if (!constHoverId && !netHoveredId) closeCard();
        }, 280);
    }
    if (card) {
        card.addEventListener('pointerenter', () => clearTimeout(hideCardTimer));
        card.addEventListener('pointerleave', () => scheduleCloseCard(Boolean(constSelectedId || netSelectedId)));
    }

    /* ================= 模式一：方案 B · 实时物理不规则星座 ================= */
    const clusterMap = new Map();
    friends.forEach(f => {
        if (!clusterMap.has(f.cluster)) clusterMap.set(f.cluster, []);
        clusterMap.get(f.cluster).push(f);
    });
    const clusters = [...clusterMap.entries()].map(([name, list], i) => {
        const theme = CLUSTER_THEMES[i % CLUSTER_THEMES.length];
        return {
            id: 'c-' + i,
            title: `${theme.suffix} · ${name}`,
            name,
            list,
            anchor: { cx: theme.cx, cy: theme.cy, shape: theme.shape }
        };
    });

    const bgStars = Array.from({ length: 150 }, () => ({
        rx: Math.random(), ry: Math.random(), r: 0.6 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2, speed: 0.8 + Math.random() * 1.6
    }));

    const constFriends = friends.map((f, i) => Object.assign({}, f, {
        x: 560, y: 310, vx: 0, vy: 0, tx: 560, ty: 310, phase: i * 1.23
    }));
    const constById = new Map(constFriends.map(f => [f.id, f]));
    const constEdges = [];
    clusters.forEach(c => {
        const l = c.list.map(f => constById.get(f.id));
        for (let i = 0; i < l.length - 1; i++) constEdges.push({ a: l[i], b: l[i + 1], main: true, cluster: c });
        if (l.length >= 4) constEdges.push({ a: l[0], b: l[2], main: false, cluster: c });
    });
    const skyBridges = [];
    for (let i = 0; i < clusters.length - 1; i++) {
        const aId = clusters[i]?.list?.[0]?.id;
        const bId = clusters[i + 1]?.list?.[0]?.id;
        const a = aId ? constById.get(aId) : null;
        const b = bId ? constById.get(bId) : null;
        if (a && b) skyBridges.push([a, b]);
    }
    if (clusters.length >= 3) {
        const aId = clusters[0]?.list?.[0]?.id;
        const bId = clusters[clusters.length - 1]?.list?.[0]?.id;
        const a = aId ? constById.get(aId) : null;
        const b = bId ? constById.get(bId) : null;
        if (a && b) skyBridges.push([a, b]);
    }

    let constSubMode = 'sky'; // 'sky' | 'constellation' | 'all'
    let activeCluster = null;
    let hoveredCluster = null;
    let constHoverId = null;
    let constSelectedId = null;
    let constDragged = null, constDragMoved = false;
    let mouse = { x: -9999, y: -9999 };
    let meteor = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, nextAt: performance.now() + 2600 };

    const STAR4_PATH = 'M14 2 Q14 14 26 14 Q14 14 14 26 Q14 14 2 14 Q14 14 14 2 Z';

    const clusterPills = clusters.map(c => {
        const el = document.createElement('div');
        el.className = 'ag-const-node ag-const-pill';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'ag-const-name';
        nameSpan.textContent = c.title;
        const metaSpan = document.createElement('span');
        metaSpan.className = 'ag-const-meta';
        metaSpan.textContent = `${c.list.length} 颗星 · 放大`;
        el.append(nameSpan, metaSpan);
        el.addEventListener('pointerenter', () => { hoveredCluster = c; el.classList.add('is-hot'); });
        el.addEventListener('pointerleave', () => { if (hoveredCluster === c) hoveredCluster = null; el.classList.remove('is-hot'); });
        el.addEventListener('click', e => {
            e.stopPropagation();
            activeCluster = c;
            constSubMode = 'constellation';
            constSelectedId = null;
            closeCard();
            updateConstTargets();
        });
        overlay.appendChild(el);
        return { data: c, el };
    });

    const constStarNodes = constFriends.map(f => {
        const el = document.createElement('div');
        el.className = 'ag-const-node';
        el.style.setProperty('--orb-bg', f.pal.bg);
        el.style.setProperty('--orb-glow', f.pal.glow);

        const shell = document.createElement('div');
        shell.className = 'ag-const-star-shell';
        const spark = document.createElement('div');
        spark.className = 'ag-const-star-spark';
        const sparkSvg = document.createElementNS(NS, 'svg');
        sparkSvg.setAttribute('viewBox', '0 0 28 28');
        sparkSvg.setAttribute('aria-hidden', 'true');
        const sparkPath = document.createElementNS(NS, 'path');
        sparkPath.setAttribute('d', STAR4_PATH);
        sparkPath.setAttribute('fill', '#fff');
        sparkSvg.appendChild(sparkPath);
        spark.appendChild(sparkSvg);

        const orb = document.createElement('div');
        orb.className = 'ag-const-orb';
        if (isImageIcon(f.icon)) {
            const img = document.createElement('img');
            img.src = f.icon;
            img.alt = '';
            img.decoding = 'async';
            orb.appendChild(img);
        } else {
            const glyphSpan = document.createElement('span');
            glyphSpan.className = 'ag-const-glyph';
            glyphSpan.textContent = f.icon || f.glyph;
            orb.appendChild(glyphSpan);
        }
        shell.append(spark, orb);

        const labelSpan = document.createElement('span');
        labelSpan.className = 'ag-const-name';
        labelSpan.textContent = f.label;
        el.append(shell, labelSpan);

        el.addEventListener('pointerenter', () => {
            constHoverId = f.id;
            openCard(f);
        });
        el.addEventListener('pointerleave', () => {
            if (constHoverId === f.id) constHoverId = null;
            scheduleCloseCard(Boolean(constSelectedId));
        });
        el.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.stopPropagation();
            downX = e.clientX; downY = e.clientY;
            constDragged = f; constDragMoved = false;
        });
        el.addEventListener('click', e => {
            e.stopPropagation();
            if (constDragMoved) return;
            constSelectedId = f.id;
            openCard(f);
            const cleanUrl = safeHref(f.url);
            if (cleanUrl && cleanUrl !== '#') window.open(cleanUrl, '_blank', 'noopener,noreferrer');
        });
        overlay.appendChild(el);
        return { data: f, el };
    });

    function setHudSubText(text) {
        if (!hudSub) return;
        const val = String(text || '').trim();
        hudSub.textContent = val;
        hudSub.hidden = !val;
    }

    function updateConstTargets() {
        const w = stage.clientWidth || 1100, h = stage.clientHeight || 580;
        if (!friends.length) {
            btnBack.hidden = true;
            btnAll.hidden = true;
            setHudSubText(EMPTY_LINKS_TEXT);
            return;
        }
        if (constSubMode === 'sky') {
            btnBack.hidden = true;
            btnAll.textContent = '✦ 展开全部';
            setHudSubText('第 1 层深空星座：微重力飘浮中 · 点击任意星座放大（悬停星点可显徽章）');
            clusters.forEach(c => {
                c.list.forEach((raw, idx) => {
                    const f = constById.get(raw.id);
                    const [ox, oy] = c.anchor.shape[idx % c.anchor.shape.length];
                    f.tx = (c.anchor.cx + ox) * w;
                    f.ty = (c.anchor.cy + oy) * h;
                });
            });
        } else if (constSubMode === 'constellation' && activeCluster) {
            btnBack.hidden = false;
            btnAll.textContent = '✦ 展开全部';
            setHudSubText(`${activeCluster.title} · 默认星芒闪烁，悬停/点击星体显现站点图标与详情`);
            const sh = activeCluster.anchor.shape;
            activeCluster.list.forEach((raw, idx) => {
                const f = constById.get(raw.id);
                if (activeCluster.list.length === 1) {
                    f.tx = w * 0.5;
                    f.ty = h * 0.48;
                } else {
                    const [ox, oy] = sh[idx % sh.length];
                    f.tx = w * 0.5 + ox * w * 2.75;
                    f.ty = h * 0.51 + oy * h * 3.0;
                }
            });
        } else {
            btnBack.hidden = false;
            btnAll.textContent = '收起全景';
            setHudSubText(`全部不规则星座（${friends.length} 站）· 拖拽星体重排，悬停星星显现图标`);
            clusters.forEach(c => {
                c.list.forEach((raw, idx) => {
                    const f = constById.get(raw.id);
                    const [ox, oy] = c.anchor.shape[idx % c.anchor.shape.length];
                    f.tx = (c.anchor.cx + ox * 1.45) * w;
                    f.ty = (c.anchor.cy + oy * 1.45) * h;
                });
            });
        }
    }
    updateConstTargets();
    constFriends.forEach(f => { f.x = f.tx; f.y = f.ty; });

    /* ================= 模式二：星月图谱（月亮中心 · 大发光圆形分类 · 星星默认/悬停显图标） ================= */
    const netNodes = [{ id: 'hub', kind: 'hub', label: hubName, desc: hubDesc, tags: ['中心明月'] }];
    const netTagMap = new Map();
    const netEdges = [];
    friends.forEach(f => {
        const nf = Object.assign({}, f, { kind: 'friend', vx: 0, vy: 0, x: 550, y: 290, phase: Math.random() * Math.PI * 2 });
        netNodes.push(nf);
        netEdges.push({ source: 'hub', target: nf.id, kind: 'hub-friend' });
        f.tags.forEach(t => {
            const tid = 'tag-' + t;
            if (!netTagMap.has(tid)) {
                const tn = { id: tid, kind: 'tag', label: '# ' + t, vx: 0, vy: 0, x: 550, y: 290, phase: Math.random() * Math.PI * 2 };
                netTagMap.set(tid, tn);
                netNodes.push(tn);
                netEdges.push({ source: 'hub', target: tid, kind: 'hub-tag' });
            }
            netEdges.push({ source: tid, target: nf.id, kind: 'tag-friend' });
        });
    });

    const netNodeById = new Map(netNodes.map(n => [n.id, n]));
    const netNeighbor = new Map(netNodes.map(n => [n.id, new Set([n.id])]));
    netEdges.forEach(e => {
        netNeighbor.get(e.source).add(e.target);
        netNeighbor.get(e.target).add(e.source);
    });

    function initNetPositions() {
        const w = stage.clientWidth || 1100, h = stage.clientHeight || 580;
        const cx = w * 0.5, cy = h * 0.5;
        const tagNodes = netNodes.filter(n => n.kind === 'tag');
        const friendNodes = netNodes.filter(n => n.kind === 'friend');
        const rxMax = Math.max(220, w * 0.38);
        const ryMax = Math.max(150, h * 0.35);
        netNodes.forEach(n => {
            if (n.kind === 'hub') { n.x = cx; n.y = cy; }
            else if (n.kind === 'tag') {
                const ti = tagNodes.indexOf(n);
                const ta = (ti / Math.max(1, tagNodes.length)) * Math.PI * 2 - Math.PI * 0.42;
                n.x = cx + Math.cos(ta) * rxMax * 0.47;
                n.y = cy + Math.sin(ta) * ryMax * 0.53;
            } else {
                const fi = friendNodes.indexOf(n);
                const fa = (fi / Math.max(1, friendNodes.length)) * Math.PI * 2 - Math.PI * 0.25;
                const s = (friendNodes.length > 10 && fi % 2 === 1) ? 1.0 : 0.78;
                n.x = cx + Math.cos(fa) * rxMax * s;
                n.y = cy + Math.sin(fa) * ryMax * s;
            }
            n.vx = 0; n.vy = 0;
        });
    }
    initNetPositions();

    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML =
        '<radialGradient id="ag-graph-moon-grad" cx="30%" cy="28%">' +
            '<stop offset="0%" stop-color="#ffffff"/>' +
            '<stop offset="48%" stop-color="#e8efff"/>' +
            '<stop offset="100%" stop-color="#b4b0ff"/>' +
        '</radialGradient>' +
        '<radialGradient id="ag-graph-moon-aura" cx="50%" cy="50%">' +
            '<stop offset="0%" stop-color="#dbe6ff" stop-opacity="0.42"/>' +
            '<stop offset="62%" stop-color="#a8b6ff" stop-opacity="0.14"/>' +
            '<stop offset="100%" stop-color="#8fa8ff" stop-opacity="0"/>' +
        '</radialGradient>' +
        '<radialGradient id="ag-tag-orb-grad" cx="35%" cy="30%">' +
            '<stop offset="0%" stop-color="#8faaff" stop-opacity="0.34"/>' +
            '<stop offset="65%" stop-color="#3c5296" stop-opacity="0.42"/>' +
            '<stop offset="100%" stop-color="#141e42" stop-opacity="0.54"/>' +
        '</radialGradient>' +
        '<linearGradient id="ag-graph-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">' +
            '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.88"/>' +
            '<stop offset="50%" stop-color="#a8c6ff" stop-opacity="0.45"/>' +
            '<stop offset="100%" stop-color="#ffd0c2" stop-opacity="0.82"/>' +
        '</linearGradient>' +
        '<linearGradient id="ag-graph-edge-glow" x1="0%" y1="0%" x2="100%" y2="0%">' +
            '<stop offset="0%" stop-color="#a8dcff"/>' +
            '<stop offset="50%" stop-color="#ffffff"/>' +
            '<stop offset="100%" stop-color="#ffd0df"/>' +
        '</linearGradient>' +
        STAR_PALETTE.map((p, idx) =>
            `<radialGradient id="ag-star-grad-${idx}" cx="34%" cy="30%">` +
                `<stop offset="0%" stop-color="${p.stops[0]}"/><stop offset="55%" stop-color="${p.stops[1]}"/><stop offset="100%" stop-color="${p.stops[2]}"/>` +
            `</radialGradient>`
        ).join('');
    svg.appendChild(defs);

    const backdropLayer = document.createElementNS(NS, 'g');
    const edgeLayer = document.createElementNS(NS, 'g');
    const nodeLayer = document.createElementNS(NS, 'g');
    svg.append(backdropLayer, edgeLayer, nodeLayer);

    const innerOrbit = document.createElementNS(NS, 'ellipse');
    innerOrbit.setAttribute('class', 'ag-graph-orbit');
    const outerOrbit = document.createElementNS(NS, 'ellipse');
    outerOrbit.setAttribute('class', 'ag-graph-orbit is-outer');
    backdropLayer.append(innerOrbit, outerOrbit);

    function layoutNetBackdrop() {
        const w = stage.clientWidth || 1100, h = stage.clientHeight || 580;
        const cx = w * 0.5, cy = h * 0.5;
        innerOrbit.setAttribute('cx', String(cx)); innerOrbit.setAttribute('cy', String(cy));
        innerOrbit.setAttribute('rx', String(Math.round(w * 0.22))); innerOrbit.setAttribute('ry', String(Math.round(h * 0.23)));
        outerOrbit.setAttribute('cx', String(cx)); outerOrbit.setAttribute('cy', String(cy));
        outerOrbit.setAttribute('rx', String(Math.round(w * 0.38))); outerOrbit.setAttribute('ry', String(Math.round(h * 0.36)));
    }
    layoutNetBackdrop();

    const netEdgeEls = netEdges.map(e => {
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('class', 'ag-graph-edge' + (e.kind === 'tag-friend' ? ' is-tag-link' : ''));
        edgeLayer.appendChild(line);
        return { data: e, el: line };
    });

    let netHoveredId = null, netSelectedId = null, netDragged = null, netDragMoved = false;
    let downX = 0, downY = 0;

    function updateNetHighlight() {
        const focusId = netHoveredId || netSelectedId;
        const activeSet = focusId ? netNeighbor.get(focusId) : null;
        netNodeEls.forEach(item => {
            const self = item.data.id === focusId;
            const rel = activeSet ? activeSet.has(item.data.id) : false;
            item.g.classList.toggle('is-highlight', self);
            item.g.classList.toggle('is-selected', item.data.id === netSelectedId);
            item.g.classList.toggle('is-dim', Boolean(focusId && !rel));
        });
        netEdgeEls.forEach(item => {
            const hit = focusId && (item.data.source === focusId || item.data.target === focusId);
            item.el.classList.toggle('is-highlight', Boolean(hit));
            item.el.classList.toggle('is-dim', Boolean(focusId && !hit));
        });
    }

    const netNodeEls = netNodes.map(n => {
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'ag-graph-node is-' + n.kind);
        const r = n.kind === 'hub' ? 26 : n.kind === 'tag' ? 11 : 15;

        const hit = document.createElementNS(NS, 'circle');
        hit.setAttribute('r', String(r + 8));
        hit.setAttribute('fill', 'transparent');
        hit.setAttribute('pointer-events', 'all');
        g.appendChild(hit);

        const halo = document.createElementNS(NS, 'circle');
        halo.setAttribute('class', 'ag-graph-halo');
        halo.setAttribute('r', String(r + 6));
        g.appendChild(halo);

        if (n.kind === 'hub') {
            const aura = document.createElementNS(NS, 'circle');
            aura.setAttribute('class', 'ag-moon-aura');
            aura.setAttribute('r', '40');
            g.appendChild(aura);

            const ring = document.createElementNS(NS, 'ellipse');
            ring.setAttribute('class', 'ag-graph-hub-ring');
            ring.setAttribute('rx', '38'); ring.setAttribute('ry', '10.5');
            ring.setAttribute('transform', 'rotate(-18)');
            g.appendChild(ring);

            const moon = document.createElementNS(NS, 'path');
            moon.setAttribute('class', 'ag-moon-crescent');
            moon.setAttribute('d', 'M 6 -22 A 22 22 0 1 0 22 8 A 17 17 0 1 1 6 -22 Z');
            g.appendChild(moon);

            const gleam = document.createElementNS(NS, 'path');
            gleam.setAttribute('d', 'M13 -13 L14.4 -9.5 L18 -8.1 L14.4 -6.7 L13 -3.2 L11.6 -6.7 L8 -8.1 L11.6 -9.5 Z');
            gleam.setAttribute('fill', '#ffffff');
            g.appendChild(gleam);
        } else if (n.kind === 'tag') {
            const orb = document.createElementNS(NS, 'circle');
            orb.setAttribute('class', 'ag-graph-circle');
            orb.setAttribute('r', String(r));
            g.appendChild(orb);
        } else {
            // 与星座星群一致的纯净 4 角亮星
            const starG = document.createElementNS(NS, 'g');
            starG.setAttribute('class', 'ag-friend-star');
            const spath = document.createElementNS(NS, 'path');
            spath.setAttribute('d', 'M0 -13 Q0 0 13 0 Q0 0 0 13 Q0 0 -13 0 Q0 0 0 -13 Z');
            spath.setAttribute('fill', '#ffffff');
            spath.setAttribute('style', `filter:drop-shadow(0 0 10px ${n.pal.glow})`);
            starG.appendChild(spath);
            g.appendChild(starG);

            // 悬停 / 点击后显现自定义图标或徽章
            const badgeG = document.createElementNS(NS, 'g');
            badgeG.setAttribute('class', 'ag-friend-badge');
            if (isImageIcon(n.icon)) {
                const clipId = 'ag-net-clip-' + n.id;
                const cp = document.createElementNS(NS, 'clipPath');
                cp.setAttribute('id', clipId);
                const cc = document.createElementNS(NS, 'circle');
                cc.setAttribute('r', String(r));
                cp.appendChild(cc);
                defs.appendChild(cp);

                const imgEl = document.createElementNS(NS, 'image');
                imgEl.setAttribute('href', n.icon);
                imgEl.setAttribute('x', String(-r)); imgEl.setAttribute('y', String(-r));
                imgEl.setAttribute('width', String(r * 2)); imgEl.setAttribute('height', String(r * 2));
                imgEl.setAttribute('clip-path', `url(#${clipId})`);
                badgeG.appendChild(imgEl);

                const rim = document.createElementNS(NS, 'circle');
                rim.setAttribute('class', 'ag-graph-circle'); rim.setAttribute('r', String(r)); rim.setAttribute('fill', 'none');
                badgeG.appendChild(rim);
            } else {
                const c = document.createElementNS(NS, 'circle');
                c.setAttribute('class', 'ag-graph-circle'); c.setAttribute('r', String(r));
                c.setAttribute('fill', `url(#ag-star-grad-${n.palIdx})`);
                badgeG.appendChild(c);

                const gl = document.createElementNS(NS, 'text');
                gl.setAttribute('class', 'ag-graph-glyph');
                gl.textContent = n.icon || n.glyph;
                badgeG.appendChild(gl);
            }
            g.appendChild(badgeG);
        }

        const txt = document.createElementNS(NS, 'text');
        txt.setAttribute('class', 'ag-graph-label');
        txt.setAttribute('dy', String(r + 17));
        txt.textContent = n.label;
        g.appendChild(txt);
        nodeLayer.appendChild(g);

        g.addEventListener('pointerenter', () => {
            netHoveredId = n.id;
            updateNetHighlight();
            if (n.kind === 'friend') openCard(n);
        });
        g.addEventListener('pointerleave', () => {
            if (netHoveredId === n.id) netHoveredId = null;
            updateNetHighlight();
            scheduleCloseCard(Boolean(netSelectedId));
        });
        g.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.stopPropagation();
            downX = e.clientX; downY = e.clientY;
            netDragged = n; netDragMoved = false;
        });
        g.addEventListener('click', e => {
            e.stopPropagation();
            if (netDragMoved) return;
            netSelectedId = n.id;
            updateNetHighlight();
            if (n.kind === 'friend') {
                openCard(n);
                const cleanUrl = safeHref(n.url);
                if (cleanUrl && cleanUrl !== '#') window.open(cleanUrl, '_blank', 'noopener,noreferrer');
            } else {
                closeCard();
            }
        });
        return { data: n, g };
    });

    /* ================= 主模式调度 & 共享 60fps 渲染循环 ================= */
    let viewMode = 'network';
    try {
        const saved = localStorage.getItem(MODE_KEY);
        if (saved === 'network' || saved === 'constellation') viewMode = saved;
    } catch {}

    function setViewMode(nextMode) {
        viewMode = nextMode === 'network' ? 'network' : 'constellation';
        try { localStorage.setItem(MODE_KEY, viewMode); } catch {}
        modeTabs.forEach(tab => {
            const active = tab.dataset.linksMode === viewMode;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        const isConst = viewMode === 'constellation';
        const hasFriends = friends.length > 0;
        overlay.toggleAttribute('hidden', !isConst);
        svg.toggleAttribute('hidden', isConst);
        btnBack.toggleAttribute('hidden', !isConst || !hasFriends || constSubMode === 'sky');
        btnAll.toggleAttribute('hidden', !isConst || !hasFriends);
        btnReset.toggleAttribute('hidden', isConst || !hasFriends);
        closeCard();
        constSelectedId = null;
        netSelectedId = null;
        updateNetHighlight();
        if (isConst) {
            updateConstTargets();
        } else {
            layoutNetBackdrop();
            setHudSubText(hasFriends ? defaultNetworkHudSub : EMPTY_LINKS_TEXT);
        }
    }
    modeTabs.forEach(tab => tab.addEventListener('click', () => setViewMode(tab.dataset.linksMode)));
    setViewMode(viewMode);

    function fitCanvas() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = stage.clientWidth || 1100, h = stage.clientHeight || 580;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { w, h };
    }

    function drawSpike(x, y, r, alpha) {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(0, -r * 2.5); ctx.quadraticCurveTo(0, 0, r * 2.5, 0);
        ctx.quadraticCurveTo(0, 0, 0, r * 2.5); ctx.quadraticCurveTo(0, 0, -r * 2.5, 0);
        ctx.quadraticCurveTo(0, 0, 0, -r * 2.5);
        ctx.fill();
        ctx.restore();
    }

    let lastT = performance.now();
    function tick(now) {
        const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
        lastT = now;
        const { w, h } = fitCanvas();
        const tSec = now * 0.001;
        ctx.clearRect(0, 0, w, h);

        // 背景闪烁星尘与偶发流星（双模式共用）
        bgStars.forEach((s, i) => {
            const tw = 0.22 + 0.78 * ((Math.sin(now * 0.0014 * s.speed + s.phase) + 1) * 0.5);
            const sx = s.rx * w, sy = s.ry * h;
            ctx.fillStyle = `rgba(235, 244, 255, ${(tw * 0.62).toFixed(2)})`;
            ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, Math.PI * 2); ctx.fill();
            if (i % 26 === 0) drawSpike(sx, sy, s.r * 1.4, tw * 0.55);
        });

        if (!meteor.active && now > meteor.nextAt) {
            meteor.active = true;
            meteor.x = w * (0.18 + Math.random() * 0.55);
            meteor.y = h * (0.06 + Math.random() * 0.25);
            meteor.vx = 460; meteor.vy = 210; meteor.life = 1;
        }
        if (meteor.active) {
            meteor.x += meteor.vx * dt; meteor.y += meteor.vy * dt; meteor.life -= dt * 1.35;
            if (meteor.life <= 0) { meteor.active = false; meteor.nextAt = now + 4500 + Math.random() * 5000; }
            else {
                const tx = meteor.x - meteor.vx * 0.14, ty = meteor.y - meteor.vy * 0.14;
                const g = ctx.createLinearGradient(meteor.x, meteor.y, tx, ty);
                g.addColorStop(0, `rgba(255,255,255,${meteor.life.toFixed(2)})`);
                g.addColorStop(1, 'rgba(160,195,255,0)');
                ctx.strokeStyle = g; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(meteor.x, meteor.y); ctx.lineTo(tx, ty); ctx.stroke();
            }
        }

        if (viewMode === 'constellation') {
            constFriends.forEach(f => {
                if (f === constDragged) return;
                const driftX = Math.sin(tSec * 0.85 + f.phase) * 9;
                const driftY = Math.cos(tSec * 0.72 + f.phase * 1.3) * 7;
                f.vx += (f.tx + driftX - f.x) * 3.8 * dt;
                f.vy += (f.ty + driftY - f.y) * 3.8 * dt;
                const mdx = f.x - mouse.x, mdy = f.y - mouse.y;
                const md2 = mdx * mdx + mdy * mdy;
                if (md2 < 14000 && md2 > 1) {
                    const md = Math.sqrt(md2);
                    const push = (1 - md / 118) * 18 * dt;
                    f.vx += (mdx / md) * push; f.vy += (mdy / md) * push;
                }
                f.vx *= 0.88; f.vy *= 0.88;
                f.x += f.vx; f.y += f.vy;
            });

            const focus = constHoverId || constSelectedId;
            if (constSubMode === 'sky') {
                ctx.save();
                ctx.strokeStyle = 'rgba(205, 224, 255, 0.15)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 7]);
                skyBridges.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); });
                ctx.restore();
            }

            constEdges.forEach((e, idx) => {
                if (constSubMode === 'constellation' && e.cluster !== activeCluster) return;
                const hoverC = hoveredCluster && e.cluster === hoveredCluster;
                const hot = hoverC || (focus && (e.a.id === focus || e.b.id === focus));
                const dim = focus && !hot;
                ctx.save();
                ctx.strokeStyle = hot ? 'rgba(255, 255, 255, 0.92)' : dim ? 'rgba(200, 220, 255, 0.10)' : (e.main ? 'rgba(235, 244, 255, 0.44)' : 'rgba(205, 224, 255, 0.22)');
                ctx.lineWidth = hot ? 2 : (e.main ? 1.35 : 1);
                if (!e.main && !hot) ctx.setLineDash([4, 6]);
                ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
                ctx.restore();

                if (e.main && !dim) {
                    const p = (tSec * (hoverC ? 0.72 : 0.42) + idx * 0.23) % 1;
                    const px = e.a.x + (e.b.x - e.a.x) * p, py = e.a.y + (e.b.y - e.a.y) * p;
                    drawSpike(px, py, hot ? 2.6 : 1.7, hot ? 0.95 : 0.65);
                }
            });

            if (constSubMode === 'sky') {
                clusterPills.forEach((cp, idx) => {
                    cp.el.classList.remove('is-hidden');
                    const c = cp.data;
                    const x = c.anchor.cx * w + Math.sin(tSec * 0.7 + idx) * 4;
                    const y = c.anchor.cy * h + 86 + Math.cos(tSec * 0.6 + idx * 1.2) * 3;
                    cp.el.style.setProperty('--nx', x.toFixed(1) + 'px');
                    cp.el.style.setProperty('--ny', y.toFixed(1) + 'px');
                });
                constStarNodes.forEach(sn => {
                    sn.el.classList.add('is-hidden');
                    const f = sn.data;
                    const pulse = 0.8 + 0.25 * Math.sin(tSec * 2 + f.phase);
                    drawSpike(f.x, f.y, 4.2 * pulse, 0.92);
                    ctx.save();
                    ctx.fillStyle = 'rgba(236, 245, 255, 0.96)';
                    ctx.shadowColor = f.pal.glow; ctx.shadowBlur = 12;
                    ctx.beginPath(); ctx.arc(f.x, f.y, 4.4 * pulse, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                });
            } else {
                clusterPills.forEach(cp => cp.el.classList.add('is-hidden'));
                constStarNodes.forEach(sn => {
                    const f = sn.data;
                    const vis = constSubMode === 'all' || f.cluster === activeCluster?.name;
                    sn.el.classList.toggle('is-hidden', !vis);
                    if (!vis) return;
                    const rel = !focus || f.id === focus || constEdges.some(e => (e.a.id === focus && e.b.id === f.id) || (e.b.id === focus && e.a.id === f.id));
                    sn.el.classList.toggle('is-dim', !rel);
                    sn.el.classList.toggle('is-selected', f.id === constSelectedId);
                    sn.el.style.setProperty('--nx', f.x.toFixed(1) + 'px');
                    sn.el.style.setProperty('--ny', f.y.toFixed(1) + 'px');
                    sn.el.style.setProperty('--ns', constSubMode === 'constellation' ? '1.12' : '0.96');
                });
            }
        } else {
            // 星月图谱力学 + 微重力漂浮
            const cx = w * 0.5, cy = h * 0.5;
            const spread = Math.min(1.35, Math.max(0.85, w / 960));
            const repStrength = (friends.length > 10 ? 5200 : 4200) * spread;

            for (let i = 0; i < netNodes.length; i++) {
                const a = netNodes[i];
                if (a === netDragged) continue;
                if (a.kind === 'hub') {
                    a.vx += (cx - a.x) * 0.045; a.vy += (cy - a.y) * 0.045;
                } else {
                    const dxDrift = Math.sin(tSec * 0.75 + a.phase) * 0.05;
                    const dyDrift = Math.cos(tSec * 0.68 + a.phase * 1.2) * 0.05;
                    a.vx += (cx - a.x) * 0.0014 + dxDrift;
                    a.vy += (cy - a.y) * 0.0024 + dyDrift;
                }
                for (let j = i + 1; j < netNodes.length; j++) {
                    const b = netNodes[j];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const d2 = dx * dx * 0.72 + dy * dy + 60;
                    const d = Math.sqrt(d2);
                    const rep = repStrength / d2;
                    const fx = (dx / d) * rep * 1.15, fy = (dy / d) * rep * 0.92;
                    if (a !== netDragged) { a.vx -= fx; a.vy -= fy; }
                    if (b !== netDragged) { b.vx += fx; b.vy += fy; }
                }
            }
            netEdges.forEach(e => {
                const s = netNodeById.get(e.source), t = netNodeById.get(e.target);
                if (!s || !t) return;
                const dx = t.x - s.x, dy = t.y - s.y;
                const d = Math.sqrt(dx * dx + dy * dy) || 1;
                const rest = e.kind === 'hub-tag' ? 148 * spread : e.kind === 'hub-friend' ? 248 * spread : 134 * spread;
                const f = (d - rest) * 0.013;
                const fx = (dx / d) * f, fy = (dy / d) * f;
                if (s !== netDragged) { s.vx += fx; s.vy += fy; }
                if (t !== netDragged) { t.vx -= fx; t.vy -= fy; }
            });
            netNodes.forEach(n => {
                if (n === netDragged) return;
                n.vx *= 0.84; n.vy *= 0.84;
                n.x = Math.max(64, Math.min(w - 64, n.x + n.vx));
                n.y = Math.max(54, Math.min(h - 54, n.y + n.vy));
            });
            netNodeEls.forEach(item => {
                item.g.setAttribute('transform', `translate(${item.data.x.toFixed(1)},${item.data.y.toFixed(1)})`);
            });
            netEdgeEls.forEach(item => {
                const s = netNodeById.get(item.data.source), t = netNodeById.get(item.data.target);
                item.el.setAttribute('x1', s.x.toFixed(1)); item.el.setAttribute('y1', s.y.toFixed(1));
                item.el.setAttribute('x2', t.x.toFixed(1)); item.el.setAttribute('y2', t.y.toFixed(1));
            });
        }

        requestAnimationFrame(tick);
    }

    stage.addEventListener('pointermove', e => {
        const rect = stage.getBoundingClientRect();
        const scale = Number(getComputedStyle(stage).getPropertyValue('--ag-page-scale')) || 1;
        const width = rect.width / scale;
        const height = rect.height / scale;
        mouse.x = (e.clientX - rect.left) / scale;
        mouse.y = (e.clientY - rect.top) / scale;
        if (constDragged) {
            if (!constDragMoved && Math.hypot(e.clientX - downX, e.clientY - downY) > 4 * scale) constDragMoved = true;
            if (constDragMoved) {
                constDragged.x = Math.max(46, Math.min(width - 46, mouse.x));
                constDragged.y = Math.max(46, Math.min(height - 46, mouse.y));
                constDragged.tx = constDragged.x; constDragged.ty = constDragged.y;
                constDragged.vx = 0; constDragged.vy = 0;
            }
        }
        if (netDragged) {
            if (!netDragMoved && Math.hypot(e.clientX - downX, e.clientY - downY) > 4 * scale) netDragMoved = true;
            if (netDragMoved) {
                netDragged.x = Math.max(52, Math.min(width - 52, mouse.x));
                netDragged.y = Math.max(46, Math.min(height - 46, mouse.y));
                netDragged.vx = 0; netDragged.vy = 0;
            }
        }
    });
    stage.addEventListener('pointerleave', () => { mouse.x = -9999; mouse.y = -9999; });
    window.addEventListener('pointerup', () => {
        if (constDragged) { constDragged = null; setTimeout(() => { constDragMoved = false; }, 30); }
        if (netDragged) { netDragged = null; setTimeout(() => { netDragMoved = false; }, 30); }
    });
    stage.addEventListener('click', () => {
        closeCard();
        constSelectedId = null;
        if (netSelectedId) { netSelectedId = null; updateNetHighlight(); }
    });

    btnBack.addEventListener('click', () => { constSubMode = 'sky'; activeCluster = null; constSelectedId = null; closeCard(); updateConstTargets(); });
    btnAll.addEventListener('click', () => { constSubMode = constSubMode === 'all' ? 'sky' : 'all'; activeCluster = null; constSelectedId = null; closeCard(); updateConstTargets(); });
    btnReset.addEventListener('click', () => { initNetPositions(); layoutNetBackdrop(); netSelectedId = null; closeCard(); updateNetHighlight(); });
    document.getElementById('ag-graph-card-close')?.addEventListener('click', e => {
        e.stopPropagation(); closeCard(); constSelectedId = null; netSelectedId = null; updateNetHighlight();
    });
    window.addEventListener('resize', () => { updateConstTargets(); layoutNetBackdrop(); }, { passive: true });

    requestAnimationFrame(tick);
})();
