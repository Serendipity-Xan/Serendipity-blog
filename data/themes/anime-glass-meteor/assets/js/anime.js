/* 雾岛小站 v2 脚本
   包含：明暗切换、移动菜单、阅读进度、树形目录、目录树归档、
   Ctrl+K 命令面板、图片灯箱、代码复制、卡片聚光、照片墙。
   全部原生 JS，无第三方依赖；滚动与鼠标事件都用 requestAnimationFrame 合并。 */
(function () {
    'use strict';

    var root = document.documentElement;

    /* ---------- 1. 明暗切换 ---------- */
    var toggle = document.querySelector('.ag-theme-toggle');
    var modeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    function applyTheme(mode) {
        root.dataset.themeMode = mode;
        root.dataset.theme = mode === 'auto' ? (modeQuery.matches ? 'dark' : 'light') : mode;
        if (toggle) {
            var label = root.dataset.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
            toggle.setAttribute('aria-label', label);
            toggle.title = label;
        }
    }
    applyTheme(root.dataset.themeMode || root.dataset.theme || 'light');
    modeQuery.addEventListener('change', function () {
        if (root.dataset.themeMode === 'auto') applyTheme('auto');
    });
    if (toggle) {
        toggle.addEventListener('click', function () {
            var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            try { localStorage.setItem('ag-theme-v2', next); } catch (e) {}
        });
    }

    /* ---------- 2. 移动端菜单 ---------- */
    var burger = document.querySelector('.ag-burger');
    var nav = document.querySelector('.ag-nav');
    if (burger && nav) {
        var setMenuOpen = function (open) {
            document.body.classList.toggle('ag-menu-open', open);
            burger.setAttribute('aria-expanded', String(open));
        };
        burger.addEventListener('click', function () {
            setMenuOpen(burger.getAttribute('aria-expanded') !== 'true');
        });
        nav.addEventListener('click', function (e) {
            if (e.target.closest('a')) { setMenuOpen(false); }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
                setMenuOpen(false);
                burger.focus();
            }
        });
    }

    /* ---------- 3. 第二版目录树（精密刻度尺 + 分段星轨卡片） ---------- */
    var content = document.getElementById('ag-content');
    var toc = document.getElementById('ag-toc');
    var isPostRuler = Boolean(content && toc && (document.body.classList.contains('post-template') || document.body.classList.contains('page-template')));
    var headings = [];
    var rulerChapters = [];
    var rulerRows = [];
    var rulerBeacon = null;
    var rulerCh = null;
    var rulerRing = null;
    var rulerList = null;

    if (content && toc) {
        var chapterTag = 'H2';
        if (isPostRuler && !content.querySelector('h2')) {
            chapterTag = content.querySelector('h3') ? 'H3' : 'H4';
        }
        headings = Array.prototype.slice.call(content.querySelectorAll(chapterTag === 'H2' ? 'h2, h3' : 'h3, h4'));
        if (headings.length >= 2 && isPostRuler) {
            headings.forEach(function (h, i) {
                if (!h.id) { h.id = 'section-' + (i + 1); }
            });

            // 移到 body 下，避免受正文容器 translateX 影响 fixed 定位
            document.body.appendChild(toc);
            toc.className = 'ag-ruler-toc';
            toc.innerHTML =
                '<div class="ag-ruler-head">' +
                    '<div class="ag-ruler-head-left">' +
                        '<span class="ag-ruler-head-label">INDEX</span>' +
                        '<span class="ag-ruler-head-meter">' +
                        '<span id="ag-ruler-ch"></span>' +
                            '<svg class="ag-ruler-ring" viewBox="0 0 20 20" aria-hidden="true">' +
                                '<circle class="ag-ruler-ring-track" cx="10" cy="10" r="8" />' +
                                '<circle class="ag-ruler-ring-fill" id="ag-ruler-ring" cx="10" cy="10" r="8" />' +
                            '</svg>' +
                        '</span>' +
                    '</div>' +
                    '<button type="button" class="ag-ruler-pin" id="ag-ruler-pin">固定</button>' +
                '</div>' +
                '<div class="ag-ruler-list" id="ag-ruler-list">' +
                    '<div class="ag-ruler-beacon" id="ag-ruler-beacon" aria-hidden="true"></div>' +
                '</div>';

            rulerList = document.getElementById('ag-ruler-list');
            rulerBeacon = document.getElementById('ag-ruler-beacon');
            rulerCh = document.getElementById('ag-ruler-ch');
            rulerRing = document.getElementById('ag-ruler-ring');
            var rulerPin = document.getElementById('ag-ruler-pin');

            var setPinned = function (pinned) {
                toc.classList.toggle('is-pinned', pinned);
                rulerPin.textContent = pinned ? '已固定' : '固定';
                try { localStorage.setItem('ag-toc-pinned', pinned ? '1' : '0'); } catch (e) {}
            };
            try {
                if (localStorage.getItem('ag-toc-pinned') === '1') { setPinned(true); }
            } catch (e) {}
            rulerPin.addEventListener('click', function () {
                setPinned(!toc.classList.contains('is-pinned'));
                requestAnimationFrame(onScroll);
            });

            var currentGroup = null;
            var groups = [];
            headings.forEach(function (h) {
                if (h.tagName === chapterTag || !currentGroup || currentGroup.heading.tagName !== chapterTag) {
                    currentGroup = { heading: h, subs: [] };
                    groups.push(currentGroup);
                } else {
                    currentGroup.subs.push(h);
                }
            });

            rulerChapters = groups.map(function (g, idx) {
                var item = document.createElement('div');
                item.className = 'ag-ruler-item';

                var rail = document.createElement('span');
                rail.className = 'ag-ruler-seg-rail';
                var fill = document.createElement('span');
                fill.className = 'ag-ruler-seg-fill';
                rail.appendChild(fill);
                item.appendChild(rail);

                var a = document.createElement('a');
                a.className = 'ag-ruler-row';
                a.href = '#' + g.heading.id;
                var num = document.createElement('span');
                num.className = 'ag-ruler-num';
                num.textContent = String(idx + 1).padStart(2, '0');
                var text = document.createElement('span');
                text.textContent = g.heading.textContent.trim();
                var label = document.createElement('span');
                label.className = 'ag-ruler-label';
                label.appendChild(num);
                label.appendChild(text);
                var tick = document.createElement('span');
                tick.className = 'ag-ruler-tick';
                a.appendChild(label);
                a.appendChild(tick);
                item.appendChild(a);
                rulerRows.push({ h: g.heading, a: a });

                var subRows = [];
                if (g.subs.length) {
                    var subWrap = document.createElement('div');
                    subWrap.className = 'ag-ruler-sub-wrap';
                    var subInner = document.createElement('div');
                    subInner.className = 'ag-ruler-sub-inner';
                    g.subs.forEach(function (sh) {
                        var sa = document.createElement('a');
                        sa.className = 'ag-ruler-row is-sub';
                        sa.href = '#' + sh.id;
                        var sl = document.createElement('span');
                        sl.className = 'ag-ruler-label';
                        sl.textContent = sh.textContent.trim();
                        var st = document.createElement('span');
                        st.className = 'ag-ruler-tick';
                        sa.appendChild(sl);
                        sa.appendChild(st);
                        subInner.appendChild(sa);
                        rulerRows.push({ h: sh, a: sa });
                        subRows.push({ h: sh, el: sa });
                    });
                    subWrap.appendChild(subInner);
                    item.appendChild(subWrap);
                }

                rulerList.appendChild(item);
                return { heading: g.heading, item: item, a: a, fill: fill, subRows: subRows, idx: idx };
            });

            rulerList.addEventListener('pointermove', function (e) {
                rulerRows.forEach(function (r) {
                    var rect = r.a.getBoundingClientRect();
                    var dist = Math.abs(e.clientY - (rect.top + rect.height / 2));
                    var wave = Math.max(0, 1 - dist / 72);
                    r.a.style.setProperty('--wave', (wave * wave).toFixed(3));
                });
            });
            rulerList.addEventListener('pointerleave', function () {
                rulerRows.forEach(function (r) { r.a.style.removeProperty('--wave'); });
            });
            rulerList.addEventListener('transitionend', function (e) {
                if (e.propertyName === 'grid-template-rows') { requestAnimationFrame(onScroll); }
            });
            toc.hidden = false;
        } else if (headings.length >= 2) {
            var tocRoot = document.createElement('ol');
            tocRoot.className = 'ag-toc-root';
            var parentLi = null;

            headings.forEach(function (h, i) {
                if (!h.id) { h.id = 'section-' + (i + 1); }
                var li = document.createElement('li');
                var a = document.createElement('a');
                a.href = '#' + h.id;
                a.textContent = h.textContent.trim();
                li.appendChild(a);

                if (h.tagName === 'H2') {
                    tocRoot.appendChild(li);
                    parentLi = li;
                } else {
                    var sub = parentLi ? parentLi.querySelector('.ag-toc-sub') : null;
                    if (!sub) {
                        sub = document.createElement('ol');
                        sub.className = 'ag-toc-sub';
                        if (parentLi) {
                            parentLi.appendChild(sub);
                            parentLi.classList.add('ag-toc-has-children');
                        } else {
                            tocRoot.appendChild(li);
                            parentLi = li;
                            li = null;
                        }
                    }
                    if (li) { sub.appendChild(li); }
                }
            });

            toc.appendChild(tocRoot);
            toc.hidden = false;
            var bodyWrap = toc.closest('.ag-article-body');
            if (bodyWrap) { bodyWrap.classList.add('has-toc'); }
        }
    }

    /* ---------- 4. 阅读进度 + 目录高亮（共用一次滚动回调） ---------- */
    var bar = document.querySelector('.ag-progress i');
    var header = document.querySelector('.ag-header');
    var reading = document.body.classList.contains('post-template') ? content : null;
    var lastProgress = 0;
    var tocLinks = toc ? Array.prototype.slice.call(toc.querySelectorAll('a')) : [];
    var ticking = false;

    function onScroll() {
        ticking = false;

        if (header) {
            // 固定页头沿用进度条的帧调度。双阈值避免边界附近轻微滚动反复切换。
            var threshold = header.classList.contains('is-compact') ? 72 : 80;
            header.classList.toggle('is-compact', window.scrollY > threshold);
        }

        if (bar) {
            var max = document.documentElement.scrollHeight - window.innerHeight;
            var pct = max > 0 ? window.scrollY / max : 0;
            var track = bar.parentElement;
            if (reading) {
                var bounds = reading.getBoundingClientRect();
                // 阅读线取屏幕高度的 72%，正文首尾决定 0% 和 100%。
                pct = bounds.height > 0 ? (window.innerHeight * 0.72 - bounds.top) / bounds.height : 0;
            }
            pct = Math.min(1, Math.max(0, pct));
            bar.style.transform = 'scaleX(' + pct + ')';
            if (reading) {
                track.style.setProperty('--ag-reading-progress', pct.toFixed(4));
                if (pct === 1 && lastProgress < 1) { track.dispatchEvent(new Event('ag:reading-complete')); }
                lastProgress = pct;
            }
        }

        if (rulerChapters.length && headings.length) {
            var activeH = headings[0];
            var atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;
            if (atEnd) {
                activeH = headings[headings.length - 1];
            } else {
                for (var j = 0; j < headings.length; j++) {
                    if (headings[j].getBoundingClientRect().top <= 170) { activeH = headings[j]; }
                }
            }

            var activeChIdx = 0;
            var activeLink = rulerChapters[0].a;
            var contentRect = content.getBoundingClientRect();
            var contentTotal = Math.max(1, contentRect.height - window.innerHeight * 0.65);
            var contentPassed = Math.min(contentTotal, Math.max(0, -contentRect.top + window.innerHeight * 0.25));
            var readRatio = contentPassed / contentTotal;

            var readNextEl = document.querySelector('.ag-post-reading + .ag-section, .ag-article-foot');
            var atBottomZone = contentRect.bottom < window.innerHeight * 0.42 ||
                (readNextEl && readNextEl.getBoundingClientRect().top < window.innerHeight * 0.58);
            toc.classList.toggle('is-bottom-collapsed', Boolean(atBottomZone));

            if (rulerRing) {
                rulerRing.style.strokeDashoffset = (50.26 * (1 - readRatio)).toFixed(2);
            }

            rulerChapters.forEach(function (ch, idx) {
                var nextHeading = rulerChapters[idx + 1] ? rulerChapters[idx + 1].heading : null;
                var startTop = ch.heading.getBoundingClientRect().top;
                var endTop = nextHeading ? nextHeading.getBoundingClientRect().top : contentRect.bottom;
                var segHeight = Math.max(1, endTop - startTop);
                var segProgress = Math.min(1, Math.max(0, (170 - startTop) / segHeight));
                ch.fill.style.height = (segProgress * 100).toFixed(1) + '%';

                var isActive = ch.heading === activeH;
                var isBranch = isActive || ch.subRows.some(function (sr) { return sr.h === activeH; });
                var isDone = !isBranch && endTop < 170;
                ch.item.classList.toggle('is-branch', isBranch);
                ch.a.classList.toggle('is-active', isActive);
                ch.a.classList.toggle('is-done', isDone);
                if (isBranch) { activeChIdx = idx; }
                if (isActive) {
                    activeLink = ch.a;
                    ch.a.setAttribute('aria-current', 'location');
                } else {
                    ch.a.removeAttribute('aria-current');
                }
                ch.subRows.forEach(function (sr) {
                    var isSubAct = sr.h === activeH;
                    sr.el.classList.toggle('is-active', isSubAct);
                    sr.el.classList.toggle('is-done', !isSubAct && sr.h.getBoundingClientRect().top < 170);
                    if (isSubAct) {
                        activeLink = sr.el;
                        sr.el.setAttribute('aria-current', 'location');
                    } else {
                        sr.el.removeAttribute('aria-current');
                    }
                });
            });

            if (rulerCh) {
                rulerCh.textContent = String(activeChIdx + 1).padStart(2, '0') + ' / ' + String(rulerChapters.length).padStart(2, '0');
            }
            if (rulerBeacon && rulerList && activeLink) {
                var listBox = rulerList.getBoundingClientRect();
                var linkBox = activeLink.getBoundingClientRect();
                rulerBeacon.style.transform = 'translateY(' + (linkBox.top - listBox.top + 4).toFixed(1) + 'px)';
                rulerBeacon.style.height = Math.max(16, linkBox.height - 8).toFixed(1) + 'px';
            }
        } else if (tocLinks.length && headings.length) {
            var current = null;
            for (var i = 0; i < headings.length; i++) {
                if (headings[i].getBoundingClientRect().top <= 150) { current = headings[i].id; }
            }
            tocLinks.forEach(function (a) {
                var active = a.getAttribute('href') === '#' + current;
                a.classList.toggle('is-active', active);
                if (active) a.setAttribute('aria-current', 'location');
                else a.removeAttribute('aria-current');
            });
        }
    }

    window.addEventListener('scroll', function () {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(onScroll);
        }
    }, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();

    /* ---------- 6. 照片墙 ---------- */
    var gallery = document.getElementById('ag-gallery');
    if (gallery) {
        var scrollGallery = function (dir) {
            var first = gallery.querySelector('.ag-gallery-item');
            var step = first ? first.getBoundingClientRect().width + 14 : 240;
            gallery.scrollBy({ left: dir * step * 2, behavior: 'smooth' });
        };
        var prevBtn = document.querySelector('[data-gallery="prev"]');
        var nextBtn = document.querySelector('[data-gallery="next"]');
        if (prevBtn) { prevBtn.addEventListener('click', function () { scrollGallery(-1); }); }
        if (nextBtn) { nextBtn.addEventListener('click', function () { scrollGallery(1); }); }
    }

    /* ---------- 7. 复制链接 ---------- */
    var copyBtn = document.getElementById('ag-copy-link');
    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            var url = window.location.href;
            var done = function () {
                copyBtn.textContent = '已复制 ✓';
                setTimeout(function () { copyBtn.textContent = '复制链接'; }, 1600);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(done, function () {});
            } else {
                var input = document.createElement('input');
                input.value = url;
                document.body.appendChild(input);
                input.select();
                try { document.execCommand('copy'); done(); } catch (e) {}
                document.body.removeChild(input);
            }
        });
    }

    /* ---------- 8. 代码块工具栏与复制 ---------- */
    if (content) {
        Array.prototype.slice.call(content.querySelectorAll('pre')).forEach(function (pre) {
            var code = pre.querySelector('code');
            if (!code || pre.parentElement.classList.contains('ag-code-frame')) { return; }

            // 工具栏与可横向滚动的代码分开，长行滚动时复制按钮保留在右侧。
            var frame = document.createElement('div');
            frame.className = 'ag-code-frame';
            var bar = document.createElement('div');
            bar.className = 'ag-code-bar';
            var lights = document.createElement('span');
            lights.className = 'ag-code-lights';
            lights.setAttribute('aria-hidden', 'true');
            var actions = document.createElement('div');
            actions.className = 'ag-code-actions';

            var lang = document.createElement('span');
            var m = (code.className + ' ' + pre.className).match(/language-([\w+#-]+)/i);
            lang.textContent = m ? m[1].toUpperCase() : 'CODE';

            var copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'ag-code-copy';
            copy.textContent = '复制';
            var copyTimer;

            copy.addEventListener('click', function () {
                var txt = code.textContent.trimEnd();
                var showResult = function (succeeded) {
                    copy.textContent = succeeded ? '已复制 ✓' : '复制失败';
                    copy.classList.toggle('is-done', succeeded);
                    clearTimeout(copyTimer);
                    copyTimer = setTimeout(function () {
                        copy.textContent = '复制';
                        copy.classList.remove('is-done');
                    }, 1600);
                };
                var copyFromSelection = function () {
                    var ta = document.createElement('textarea');
                    ta.value = txt;
                    ta.readOnly = true;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    try { showResult(document.execCommand('copy')); } catch (e) { showResult(false); }
                    ta.remove();
                    copy.focus({ preventScroll: true });
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(txt).then(function () { showResult(true); }, copyFromSelection);
                } else {
                    copyFromSelection();
                }
            });

            actions.append(lang, copy);
            bar.append(lights, actions);
            pre.before(frame);
            pre.tabIndex = 0;
            frame.append(bar, pre);
        });
    }

    /* ---------- 9. 图片灯箱 ---------- */
    var lb = document.createElement('div');
    lb.className = 'ag-lightbox';
    lb.setAttribute('aria-hidden', 'true');
    lb.innerHTML = '<button type="button" class="ag-lightbox-close" aria-label="关闭">×</button><img alt="">';
    document.body.appendChild(lb);
    var lbImg = lb.querySelector('img');

    var openLightbox = function (src, alt) {
        if (!src) { return; }
        lbImg.src = src;
        lbImg.alt = alt || '';
        lb.classList.add('is-open');
        lb.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };

    var closeLightbox = function () {
        lb.classList.remove('is-open');
        lb.setAttribute('aria-hidden', 'true');
        lbImg.removeAttribute('src');
        document.body.style.overflow = '';
    };

    document.addEventListener('click', function (e) {
        var img = e.target.closest('.ag-content img, .ag-gallery-item img');
        if (img && !img.closest('a')) {
            e.preventDefault();
            openLightbox(img.currentSrc || img.src, img.alt);
        }
    });

    lb.addEventListener('click', function (e) {
        if (e.target === lb || e.target.classList.contains('ag-lightbox-close')) { closeLightbox(); }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && lb.classList.contains('is-open')) { closeLightbox(); }
    });

})();
