/* 雾岛工具箱 · 仅限 /toolbox/ 的动态环绕文章星环与「全部工具」目录 */
(function () {
    'use strict';

    var recordsBox = document.getElementById('tb-records');
    var stage = document.getElementById('tb-orbit-stage');
    var ring = document.getElementById('tb-orbit-ring');
    var allBtn = document.getElementById('tb-all-btn');
    var listView = document.getElementById('tb-list-view');
    var listBack = document.getElementById('tb-list-back');
    var listHeading = document.getElementById('tb-list-heading');
    var listTree = document.getElementById('tb-list-tree');
    var listTotal = document.getElementById('tb-list-total');
    var filterBar = document.getElementById('tb-filter-bar');
    if (!recordsBox || !stage || !ring) { return; }

    var tbCfg = (window.__AG_SITE_CONFIG__ && window.__AG_SITE_CONFIG__.toolbox) || {};
    var configuredTagSlug = (tbCfg.tagSlug && String(tbCfg.tagSlug).trim()) || 'toolbox';
    var emptyText = (tbCfg.emptyText && String(tbCfg.emptyText).trim())
        || '暂无带有工具箱标签的文章，在中文管理台给文章加上对应标签即可出现在星环里。';

    if (allBtn && typeof tbCfg.allButtonText === 'string' && tbCfg.allButtonText.trim()) {
        allBtn.textContent = tbCfg.allButtonText.trim();
    }
    if (listHeading && typeof tbCfg.listHeading === 'string' && tbCfg.listHeading.trim()) {
        listHeading.textContent = tbCfg.listHeading.trim();
    }

    function thumbUrl(raw) {
        var url = String(raw || '').trim();
        if (!url) { return ''; }
        if (/\/content\/images\/size\//i.test(url)) { return url; }
        if (/\.(svg|gif)(?:[?#].*)?$/i.test(url)) { return url; }
        return url.replace(/(\/content\/images\/)/i, '$1size/w600/');
    }

    function findTagDisplayName(apiPosts, primarySlug) {
        var norm = String(primarySlug || 'toolbox').toLowerCase();
        if (Array.isArray(apiPosts)) {
            for (var i = 0; i < apiPosts.length; i++) {
                var tags = apiPosts[i] && apiPosts[i].tags;
                if (!Array.isArray(tags)) { continue; }
                for (var j = 0; j < tags.length; j++) {
                    var t = tags[j];
                    if (t && String(t.slug || '').toLowerCase() === norm && t.name) {
                        return String(t.name).trim();
                    }
                }
            }
        }
        return norm === 'toolbox' ? '工具箱' : String(primarySlug || '工具箱');
    }

    function readDomPosts() {
        return Array.prototype.slice.call(recordsBox.querySelectorAll('article')).map(function (el) {
            var tpl = el.querySelector('template');
            var tags = tpl ? Array.prototype.slice.call(tpl.content.querySelectorAll('span')).map(function (s) {
                return { slug: s.dataset.slug || '', name: s.textContent.trim() };
            }) : [];
            return {
                title: el.dataset.title || '',
                url: el.dataset.url || '#',
                date: el.dataset.date || '',
                excerpt: el.dataset.excerpt || '',
                cover: el.dataset.cover || '',
                tags: tags
            };
        });
    }

    function formatIsoDate(iso) {
        if (!iso) { return ''; }
        var d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
            var m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
            return m ? m[1] : '';
        }
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function mapApiPosts(apiPosts, primarySlug) {
        var normPrimary = String(primarySlug || 'toolbox').toLowerCase();
        return (Array.isArray(apiPosts) ? apiPosts : []).map(function (p) {
            var tags = Array.isArray(p.tags)
                ? p.tags
                    .filter(function (t) {
                        return t && t.visibility !== 'internal' && String(t.slug || '').toLowerCase() !== normPrimary;
                    })
                    .map(function (t) {
                        return { slug: String(t.slug || '').trim(), name: String(t.name || t.slug || '').trim() };
                    })
                    .filter(function (t) { return t.slug || t.name; })
                : [];
            var rawCover = p.feature_image ? String(p.feature_image).trim() : '';
            return {
                title: String(p.title || '').trim(),
                url: String(p.url || '#').trim() || '#',
                date: formatIsoDate(p.published_at),
                excerpt: String(p.custom_excerpt || p.excerpt || '').trim(),
                cover: rawCover ? thumbUrl(rawCover) : '',
                rawCover: rawCover,
                tags: tags
            };
        });
    }

    function initToolbox(posts, activeTagSlug, activeTagName) {
        var tagDisplayName = activeTagName || (activeTagSlug === 'toolbox' ? '工具箱' : activeTagSlug);
        if (!posts.length) {
            var emptyEl = document.createElement('p');
            emptyEl.className = 'tb-empty';
            emptyEl.textContent = emptyText;
            ring.replaceChildren(emptyEl);
            if (allBtn) { allBtn.hidden = true; }
            return;
        }

        // 汇总工具箱子标签分类
        var catMap = new Map();
        posts.forEach(function (p) {
            var list = p.tags.length ? p.tags : [{ slug: 'other', name: '常用工具' }];
            list.forEach(function (t) {
                var key = (t.slug || t.name || 'other').toLowerCase();
                if (!catMap.has(key)) {
                    catMap.set(key, { slug: t.slug || key, name: t.name || t.slug || '常用工具', posts: [] });
                }
                catMap.get(key).posts.push(p);
            });
        });

        var filtered = posts.slice();
        var cards = [];
        var currentAngle = 0;
        var targetAngle = 0;
        var dragVelocity = 0;
        var autoSpeed = 0.14;
        var autoPlay = true;
        var isCardHovered = false;
        var isDragging = false;
        var dragMoved = false;
        var dragStartX = 0;
        var dragLastX = 0;
        var dragLastT = 0;
        var dragScale = 1;
        var frontIndex = 0;

        function shortestDelta(from, to) {
            var tau = Math.PI * 2;
            var d = ((to - from) % tau + tau) % tau;
            if (d > Math.PI) { d -= tau; }
            return d;
        }

        function snapTo(idx) {
            var n = cards.length;
            if (!n) { return; }
            dragVelocity = 0;
            var desired = -(idx / n) * Math.PI * 2;
            targetAngle = currentAngle + shortestDelta(currentAngle, desired);
        }

        function buildCards() {
            ring.replaceChildren();
            cards = filtered.map(function (post, idx) {
                var a = document.createElement('a');
                a.className = 'tb-orbit-card' + (post.cover ? '' : ' is-text-only');
                a.href = post.url;

                if (post.cover) {
                    var cov = document.createElement('div');
                    cov.className = 'tb-orbit-cover';
                    var img = document.createElement('img');
                    img.src = post.cover;
                    if (post.rawCover && post.rawCover !== post.cover) {
                        img.addEventListener('error', function () { img.src = post.rawCover; }, { once: true });
                    }
                    img.alt = post.title;
                    img.loading = 'lazy';
                    img.decoding = 'async';
                    cov.appendChild(img);
                    a.appendChild(cov);
                } else {
                    var spine = document.createElement('div');
                    spine.className = 'tb-orbit-spine';
                    var dot = document.createElement('span');
                    dot.className = 'tb-orbit-spine-dot';
                    spine.appendChild(dot);
                    a.appendChild(spine);
                }

                var body = document.createElement('div');
                body.className = 'tb-orbit-body';
                var tagText = post.tags.length ? post.tags[0].name : tagDisplayName;

                var meta = document.createElement('div');
                meta.className = 'tb-orbit-meta';
                var tagSpan = document.createElement('span');
                tagSpan.className = 'tb-orbit-tag';
                tagSpan.textContent = '# ' + tagText;
                var sparkSpan = document.createElement('span');
                sparkSpan.className = 'tb-orbit-spark';
                sparkSpan.textContent = '✦';
                meta.append(tagSpan, sparkSpan);

                var h3 = document.createElement('h3');
                h3.className = 'tb-orbit-title';
                h3.textContent = post.title;

                var pEl = document.createElement('p');
                pEl.className = 'tb-orbit-excerpt';
                pEl.textContent = post.excerpt;

                var cta = document.createElement('span');
                cta.className = 'tb-orbit-cta';
                cta.textContent = '点击阅读全文 →';

                body.append(meta, h3, pEl, cta);
                a.appendChild(body);

                a.addEventListener('pointerenter', function () { isCardHovered = true; });
                a.addEventListener('pointerleave', function () { isCardHovered = false; });
                a.addEventListener('click', function (e) {
                    if (dragMoved) { e.preventDefault(); return; }
                    if (idx !== frontIndex) {
                        e.preventDefault();
                        snapTo(idx);
                    }
                });

                ring.appendChild(a);
                return a;
            });
            currentAngle = 0;
            targetAngle = 0;
            dragVelocity = 0;
            frontIndex = 0;
        }

        var lastTime = performance.now();
        function tick(now) {
            var dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
            lastTime = now;

            var desiredAuto = (autoPlay && !isCardHovered && !isDragging && cards.length > 1) ? 0.14 : 0;
            autoSpeed += (desiredAuto - autoSpeed) * (1 - Math.exp(-6 * dt));

            if (!isDragging) {
                targetAngle -= autoSpeed * dt;
                if (Math.abs(dragVelocity) > 0.001) {
                    targetAngle += dragVelocity * dt;
                    dragVelocity *= Math.exp(-4.2 * dt);
                } else {
                    dragVelocity = 0;
                }
            }

            currentAngle += (targetAngle - currentAngle) * (1 - Math.exp(-10.5 * dt));

            var n = cards.length;
            if (n) {
                var w = stage.clientWidth || 1100;
                var h = stage.clientHeight || 520;
                var rx = Math.min(480, Math.max(150, w * 0.37));
                var ry = Math.min(165, Math.max(85, h * 0.31));
                var rz = w < 700 ? 120 : 210;
                var tilt = -0.13;

                var bestCos = -2;
                var bestIdx = 0;

                cards.forEach(function (card, i) {
                    var a = (i / n) * Math.PI * 2 + currentAngle;
                    var sin = Math.sin(a);
                    var cos = Math.cos(a);
                    if (cos > bestCos) { bestCos = cos; bestIdx = i; }

                    var rawX = sin * rx;
                    var rawY = cos * ry;
                    var x = rawX * Math.cos(tilt) - rawY * Math.sin(tilt);
                    var y = rawX * Math.sin(tilt) + rawY * Math.cos(tilt) - 10;
                    var z = (cos - 1) * rz;
                    var depth = (cos + 1) * 0.5;
                    var scale = 0.58 + depth * 0.46;
                    var opacity = 0.38 + depth * 0.62;
                    var rotY = -sin * 34;
                    var rotZ = -sin * 3.8;

                    card.style.setProperty('--ox', x.toFixed(2) + 'px');
                    card.style.setProperty('--oy', y.toFixed(2) + 'px');
                    card.style.setProperty('--oz', z.toFixed(2) + 'px');
                    card.style.setProperty('--os', scale.toFixed(4));
                    card.style.setProperty('--oo', opacity.toFixed(3));
                    card.style.setProperty('--ory', rotY.toFixed(2) + 'deg');
                    card.style.setProperty('--orz', rotZ.toFixed(2) + 'deg');
                    card.style.setProperty('--oi', String(Math.round(depth * 100)));
                });

                frontIndex = bestIdx;
                cards.forEach(function (card, i) { card.classList.toggle('is-front', i === frontIndex); });
            }

            requestAnimationFrame(tick);
        }

        stage.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) { return; }
            isDragging = true;
            dragMoved = false;
            dragVelocity = 0;
            dragScale = Number(getComputedStyle(stage).getPropertyValue('--ag-page-scale')) || 1;
            dragStartX = e.clientX;
            dragLastX = e.clientX;
            dragLastT = performance.now();
        });
        window.addEventListener('pointermove', function (e) {
            if (!isDragging) { return; }
            var dx = (e.clientX - dragLastX) / dragScale;
            if (Math.abs(e.clientX - dragStartX) > 6 * dragScale) { dragMoved = true; }
            var now = performance.now();
            var dt = Math.max(0.008, (now - dragLastT) / 1000);
            var deltaA = dx * 0.0042;
            targetAngle += deltaA;
            currentAngle += deltaA;
            dragVelocity = deltaA / dt;
            dragLastX = e.clientX;
            dragLastT = now;
        });
        window.addEventListener('pointerup', function () {
            if (!isDragging) { return; }
            isDragging = false;
            setTimeout(function () { dragMoved = false; }, 40);
        });
        stage.addEventListener('wheel', function (e) {
            if (Math.abs(e.deltaY) < 2 && Math.abs(e.deltaX) < 2) { return; }
            e.preventDefault();
            dragVelocity = 0;
            targetAngle -= (e.deltaY + e.deltaX) * 0.0022;
        }, { passive: false });

        // 右下角「✦ 全部工具」列表视图
        var groupEls = [];

        function findCategoryKey(query) {
            if (!query) { return null; }
            var needle = String(query).trim().toLowerCase();
            if (!needle) { return null; }
            if (catMap.has(needle)) { return needle; }
            var matched = null;
            catMap.forEach(function (cat, key) {
                if (!matched && (cat.slug.toLowerCase() === needle || cat.name.toLowerCase() === needle)) {
                    matched = key;
                }
            });
            return matched;
        }

        function applyListFilter(filterQuery) {
            var matchedKey = findCategoryKey(filterQuery);
            if (matchedKey) {
                var matchedCat = catMap.get(matchedKey);
                groupEls.forEach(function (item) {
                    var hit = item.key === matchedKey;
                    item.el.hidden = false;
                    item.el.open = hit;
                });
                if (filterBar) {
                    filterBar.replaceChildren();
                    var label = document.createElement('span');
                    label.textContent = '当前筛选：# ' + matchedCat.name + '（共 ' + matchedCat.posts.length + ' 篇）';
                    var clearBtn = document.createElement('button');
                    clearBtn.type = 'button';
                    clearBtn.className = 'tb-ctrl-btn';
                    clearBtn.textContent = '查看全部';
                    clearBtn.addEventListener('click', function () {
                        try { history.replaceState(null, '', window.location.pathname + '#all'); } catch {}
                        applyListFilter('');
                    });
                    filterBar.append(label, clearBtn);
                    filterBar.hidden = false;
                }
            } else {
                groupEls.forEach(function (item) {
                    item.el.hidden = false;
                    item.el.open = true;
                });
                if (filterBar) {
                    if (filterQuery) {
                        filterBar.replaceChildren();
                        var notice = document.createElement('span');
                        notice.textContent = '未找到「' + filterQuery + '」对应的工具分组，已为你展开全部工具。';
                        var dismissBtn = document.createElement('button');
                        dismissBtn.type = 'button';
                        dismissBtn.className = 'tb-ctrl-btn';
                        dismissBtn.textContent = '关闭提示';
                        dismissBtn.addEventListener('click', function () {
                            try { history.replaceState(null, '', window.location.pathname + '#all'); } catch {}
                            filterBar.hidden = true;
                        });
                        filterBar.append(notice, dismissBtn);
                        filterBar.hidden = false;
                    } else {
                        filterBar.hidden = true;
                        filterBar.replaceChildren();
                    }
                }
            }
        }

        function openListView(filterQuery) {
            if (!listView) { return; }
            stage.hidden = true;
            if (allBtn) { allBtn.hidden = true; }
            listView.hidden = false;
            applyListFilter(filterQuery || '');
        }

        function closeListView() {
            if (!listView) { return; }
            listView.hidden = true;
            stage.hidden = false;
            if (allBtn) { allBtn.hidden = false; }
            if (filterBar) { filterBar.hidden = true; }
            if (window.location.search || window.location.hash) {
                try { history.replaceState(null, '', window.location.pathname); } catch {}
            }
        }

        if (allBtn && listView && listTree) {
            if (listTotal) {
                listTotal.textContent = '共 ' + posts.length + ' 篇（均带 #' + tagDisplayName + ' 标签）';
            }

            listTree.replaceChildren();
            catMap.forEach(function (cat, key) {
                var details = document.createElement('details');
                details.className = 'tb-group';
                details.open = true;
                details.dataset.catSlug = cat.slug.toLowerCase();

                var summary = document.createElement('summary');
                var caret = document.createElement('span');
                caret.className = 'tb-caret';
                var nameSpan = document.createElement('span');
                nameSpan.className = 'tb-group-name';
                nameSpan.textContent = '# ' + cat.name;
                var countSpan = document.createElement('span');
                countSpan.className = 'tb-group-count';
                countSpan.textContent = cat.posts.length + ' 篇';
                summary.append(caret, nameSpan, countSpan);
                details.appendChild(summary);

                var ul = document.createElement('ul');
                ul.className = 'tb-group-list';
                cat.posts.forEach(function (p) {
                    var li = document.createElement('li');
                    var a = document.createElement('a');
                    a.className = 'tb-post-row';
                    a.href = p.url;
                    var timeEl = document.createElement('time');
                    timeEl.className = 'tb-post-date';
                    timeEl.textContent = p.date;
                    var titleEl = document.createElement('span');
                    titleEl.className = 'tb-post-title';
                    titleEl.textContent = p.title;
                    var tagBadge = document.createElement('span');
                    tagBadge.className = 'tb-post-tag';
                    tagBadge.textContent = '# ' + cat.name;
                    a.append(timeEl, titleEl, tagBadge);
                    li.appendChild(a);
                    ul.appendChild(li);
                });
                details.appendChild(ul);
                listTree.appendChild(details);
                groupEls.push({ key: key, el: details });
            });

            allBtn.addEventListener('click', function () {
                openListView('');
            });
            if (listBack) {
                listBack.addEventListener('click', closeListView);
            }
            var expBtn = document.getElementById('tb-expand-all');
            var colBtn = document.getElementById('tb-collapse-all');
            if (expBtn) { expBtn.addEventListener('click', function () { listTree.querySelectorAll('details').forEach(function (d) { d.open = true; }); }); }
            if (colBtn) { colBtn.addEventListener('click', function () { listTree.querySelectorAll('details').forEach(function (d) { d.open = false; }); }); }

            function syncFromLocation() {
                var params = new URLSearchParams(window.location.search);
                var queryTag = (params.get('tag') || '').trim();
                var rawHash = '';
                try { rawHash = decodeURIComponent((window.location.hash || '').replace(/^#/, '')).trim(); } catch {}

                if (queryTag) {
                    openListView(queryTag);
                } else if (rawHash.toLowerCase() === 'all') {
                    openListView('');
                } else if (rawHash && findCategoryKey(rawHash)) {
                    openListView(rawHash);
                }
            }

            syncFromLocation();
            window.addEventListener('hashchange', syncFromLocation);
        }

        buildCards();
        requestAnimationFrame(tick);
    }

    if (configuredTagSlug !== 'toolbox') {
        fetch('/api/toolbox-posts', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        })
            .then(function (resp) { return resp.ok ? resp.json() : null; })
            .then(function (data) {
                if (data && Array.isArray(data.posts)) {
                    var slug = (data.config && data.config.tagSlug) || configuredTagSlug;
                    var displayName = (data.tag && data.tag.name)
                        || (data.config && data.config.tagName)
                        || findTagDisplayName(data.posts, slug);
                    initToolbox(mapApiPosts(data.posts, slug), slug, displayName);
                } else {
                    initToolbox(readDomPosts(), 'toolbox', '工具箱');
                }
            })
            .catch(function () {
                initToolbox(readDomPosts(), 'toolbox', '工具箱');
            });
    } else {
        initToolbox(readDomPosts(), 'toolbox', '工具箱');
    }
})();
