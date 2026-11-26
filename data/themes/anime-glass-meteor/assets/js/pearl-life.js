/* 雾岛生活：动态读取后台配置并通过 /api/life-posts 支持可配置标签与中文分页 */
(function () {
    'use strict';

    const grid = document.getElementById('ag-life-grid');
    const paginationEl = document.getElementById('ag-life-pagination');
    const kickerEl = document.getElementById('ag-life-kicker');
    const headingEl = document.getElementById('ag-life-heading');
    const subtitleEl = document.getElementById('ag-life-subtitle');
    const listTitleEl = document.getElementById('ag-life-title');
    const albums = document.querySelector('[data-life-albums]');
    const journal = grid?.closest('[data-life-journal]');
    if (!journal || albums?.dataset.view === 'album') return;
    const hasAlbums = albums?.dataset.view === 'index';
    if (hasAlbums && !grid.querySelector('.ag-life-card')) journal.hidden = true;

    function applyOptionalText(el, val) {
        if (!el || typeof val !== 'string') return;
        const trimmed = val.trim();
        el.textContent = trimmed;
        el.hidden = !trimmed;
    }

    function applyLifeConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        applyOptionalText(kickerEl, cfg.kicker);
        applyOptionalText(headingEl, cfg.title);
        applyOptionalText(subtitleEl, cfg.subtitle);
        if (listTitleEl && typeof cfg.listHeading === 'string') {
            const trimmed = cfg.listHeading.trim();
            listTitleEl.textContent = trimmed;
            listTitleEl.hidden = !trimmed;
            if (listTitleEl.parentElement?.classList.contains('ag-life-journal-head')) {
                listTitleEl.parentElement.hidden = !trimmed;
            }
        }
    }

    applyLifeConfig(window.__AG_SITE_CONFIG__?.life);

    function parsePageFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const raw = Number.parseInt(params.get('page') || '1', 10);
        return Number.isFinite(raw) && raw >= 1 ? raw : 1;
    }

    function thumbUrl(raw) {
        const url = String(raw || '').trim();
        if (!url) return '';
        if (/\/content\/images\/size\//i.test(url)) return url;
        if (/\.(svg|gif)(?:[?#].*)?$/i.test(url)) return url;
        return url.replace(/(\/content\/images\/)/i, '$1size/w600/');
    }

    const initialPage = parsePageFromUrl();
    let ssrBackup = null;
    if (initialPage > 1) {
        ssrBackup = document.createDocumentFragment();
        while (grid.firstChild) ssrBackup.appendChild(grid.firstChild);
        grid.style.opacity = '0.45';
        grid.setAttribute('aria-busy', 'true');
    }

    function formatDates(iso) {
        if (!iso) return { full: '', short: '' };
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
            const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) return { full: `${m[1]}-${m[2]}-${m[3]}`, short: `${m[2]}-${m[3]}` };
            return { full: '', short: '' };
        }
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        return { full: `${y}-${mo}-${da}`, short: `${mo}-${da}` };
    }

    function formatReadingTime(val) {
        const minutes = Math.max(1, Number.parseInt(val, 10) || 1);
        return `${minutes} 分钟阅读`;
    }

    function renderCard(post) {
        const id = String(post.id || Math.random().toString(36).slice(2, 10));
        const title = String(post.title || '无题').trim();
        const url = String(post.url || '#').trim() || '#';
        const image = post.feature_image ? String(post.feature_image).trim() : '';
        const imageAlt = String(post.feature_image_alt || '').trim();
        const excerpt = String(post.custom_excerpt || post.excerpt || '').trim();
        const dates = formatDates(post.published_at);
        const primaryTagName = post.primary_tag?.name
            ? String(post.primary_tag.name).trim()
            : (Array.isArray(post.tags) && post.tags[0]?.name ? String(post.tags[0].name).trim() : '');

        const article = document.createElement('article');
        article.className = 'ag-life-card';

        const link = document.createElement('a');
        link.className = 'ag-life-card-link' + (image ? '' : ' is-text-only');
        link.href = url;
        link.setAttribute('aria-labelledby', `ag-life-card-${id}`);

        if (image) {
            const media = document.createElement('div');
            media.className = 'ag-life-card-media';
            const img = document.createElement('img');
            const resized = thumbUrl(image);
            img.src = resized;
            if (resized !== image) {
                img.addEventListener('error', () => { img.src = image; }, { once: true });
            }
            img.alt = imageAlt;
            img.loading = 'lazy';
            img.decoding = 'async';
            media.appendChild(img);

            const info = document.createElement('div');
            info.className = 'ag-life-card-info';
            const h3 = document.createElement('h3');
            h3.id = `ag-life-card-${id}`;
            h3.textContent = title;

            const meta = document.createElement('div');
            meta.className = 'ag-life-card-meta';
            if (dates.short) {
                const time = document.createElement('time');
                time.dateTime = dates.full;
                time.textContent = dates.short;
                meta.appendChild(time);
            }
            const rt = document.createElement('span');
            rt.textContent = formatReadingTime(post.reading_time);
            meta.appendChild(rt);
            if (primaryTagName) {
                const tagEl = document.createElement('span');
                tagEl.className = 'ag-life-card-tag';
                tagEl.textContent = primaryTagName;
                meta.appendChild(tagEl);
            }

            info.append(h3, meta);
            link.append(media, info);
        } else {
            const empty = document.createElement('div');
            empty.className = 'ag-life-card-empty';

            const head = document.createElement('div');
            head.className = 'ag-life-card-empty-head';
            if (primaryTagName) {
                const tagEl = document.createElement('span');
                tagEl.className = 'ag-life-card-empty-tag';
                tagEl.textContent = `# ${primaryTagName}`;
                head.appendChild(tagEl);
            }
            if (dates.short) {
                const time = document.createElement('time');
                time.dateTime = dates.full;
                time.textContent = dates.short;
                head.appendChild(time);
            }

            const h3 = document.createElement('h3');
            h3.id = `ag-life-card-${id}`;
            h3.textContent = title;

            const p = document.createElement('p');
            p.textContent = excerpt;

            empty.append(head, h3, p);
            link.appendChild(empty);
        }

        article.appendChild(link);
        return article;
    }

    function pageHref(pageNum) {
        const u = new URL(window.location.href);
        if (pageNum <= 1) u.searchParams.delete('page');
        else u.searchParams.set('page', String(pageNum));
        return u.pathname + u.search + u.hash;
    }

    function renderPagination(meta) {
        if (!paginationEl) return;
        const page = Number(meta?.page) || 1;
        const pages = Number(meta?.pages) || 1;
        const prev = meta?.prev ? Number(meta.prev) : null;
        const next = meta?.next ? Number(meta.next) : null;

        if (pages <= 1) {
            paginationEl.hidden = true;
            paginationEl.replaceChildren();
            return;
        }

        paginationEl.hidden = false;
        const frag = document.createDocumentFragment();

        if (prev) {
            const prevLink = document.createElement('a');
            prevLink.className = 'ag-page-btn';
            prevLink.href = pageHref(prev);
            prevLink.textContent = '← 上一页';
            prevLink.addEventListener('click', (e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                navigateToPage(prev);
            });
            frag.appendChild(prevLink);
        } else {
            const prevDisabled = document.createElement('span');
            prevDisabled.className = 'ag-page-btn is-disabled';
            prevDisabled.setAttribute('aria-disabled', 'true');
            prevDisabled.textContent = '← 上一页';
            frag.appendChild(prevDisabled);
        }

        const info = document.createElement('span');
        info.className = 'ag-page-info';
        info.textContent = `第 ${page} / ${pages} 页`;
        frag.appendChild(info);

        if (next) {
            const nextLink = document.createElement('a');
            nextLink.className = 'ag-page-btn';
            nextLink.href = pageHref(next);
            nextLink.textContent = '下一页 →';
            nextLink.addEventListener('click', (e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                navigateToPage(next);
            });
            frag.appendChild(nextLink);
        } else {
            const nextDisabled = document.createElement('span');
            nextDisabled.className = 'ag-page-btn is-disabled';
            nextDisabled.setAttribute('aria-disabled', 'true');
            nextDisabled.textContent = '下一页 →';
            frag.appendChild(nextDisabled);
        }

        paginationEl.replaceChildren(frag);
    }

    let activeRequest = 0;

    function restoreFallbackGrid() {
        if (ssrBackup && !grid.children.length) {
            grid.appendChild(ssrBackup);
            ssrBackup = null;
        }
        grid.style.removeProperty('opacity');
        grid.removeAttribute('aria-busy');
    }

    async function loadPage(page, scrollToTop, alreadyClamped) {
        const reqId = ++activeRequest;
        try {
            const resp = await fetch(`/api/life-posts?page=${encodeURIComponent(page)}`, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' }
            });
            if (!resp.ok) {
                if (reqId === activeRequest) restoreFallbackGrid();
                return;
            }
            const data = await resp.json();
            if (reqId !== activeRequest || !data || !Array.isArray(data.posts)) return;

            if (data.config) applyLifeConfig(data.config);

            const totalPages = Number(data.pagination?.pages) || 0;
            if (!alreadyClamped && totalPages >= 1 && page > totalPages) {
                try { history.replaceState({ lifePage: totalPages }, '', pageHref(totalPages)); } catch {}
                return loadPage(totalPages, scrollToTop, true);
            }

            ssrBackup = null;
            journal.hidden = hasAlbums && !data.posts.length;
            if (!data.posts.length) {
                const emptyMsg = document.createElement('p');
                emptyMsg.className = 'ag-life-empty';
                emptyMsg.textContent = '暂无生活记录，发布带有生活标签的文章后会出现在这里。';
                grid.replaceChildren(emptyMsg);
            } else {
                const frag = document.createDocumentFragment();
                data.posts.forEach((post) => frag.appendChild(renderCard(post)));
                grid.replaceChildren(frag);
            }
            grid.style.removeProperty('opacity');
            grid.removeAttribute('aria-busy');

            renderPagination(data.pagination);

            if (scrollToTop) {
                const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                const target = listTitleEl || grid;
                target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
            }
        } catch {
            // Keep Ghost server-rendered fallback grid intact on transient network failure.
            if (reqId === activeRequest) restoreFallbackGrid();
        }
    }

    function navigateToPage(targetPage) {
        const url = pageHref(targetPage);
        try { history.pushState({ lifePage: targetPage }, '', url); } catch {}
        loadPage(targetPage, true, false);
    }

    window.addEventListener('popstate', () => {
        loadPage(parsePageFromUrl(), true, false);
    });

    loadPage(initialPage, false, false);
})();
