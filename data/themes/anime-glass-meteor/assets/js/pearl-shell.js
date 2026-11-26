(function () {
    let frame = 0;

    function syncNavigation() {
        frame = 0;
        document.body.classList.toggle('ag-nav-floating', window.scrollY > 0);
    }

    function scheduleNavigation() {
        if (!frame) frame = requestAnimationFrame(syncNavigation);
    }

    syncNavigation();
    window.addEventListener('scroll', scheduleNavigation, { passive: true });
    window.addEventListener('pageshow', scheduleNavigation);

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

    // Sanitize author website links rendered on author pages.
    document.querySelectorAll('a.ag-author-website').forEach((link) => {
        const clean = safeHref(link.getAttribute('href'));
        if (clean === '#') link.remove();
        else link.href = clean;
    });

    // Sync life tag page header / list heading / "全部生活" link with configured life settings.
    if (document.body.classList.contains('tag-template') && !document.getElementById('ag-life-grid')) {
        const lifeCfg = window.__AG_SITE_CONFIG__?.life;
        const introEl = document.querySelector('.ag-life-intro');
        const slugFromAttr = introEl?.dataset.tagSlug || '';
        const pathMatch = location.pathname.match(/^\/tag\/([^/]+)/i);
        let currentSlug = slugFromAttr || (pathMatch ? pathMatch[1] : '');
        try { currentSlug = decodeURIComponent(currentSlug); } catch {}
        currentSlug = currentSlug.trim().toLowerCase();

        const configuredSlugs = Array.isArray(lifeCfg?.tagSlugs)
            ? lifeCfg.tagSlugs.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
            : ['travel', 'life', 'music'];
        const isLifeTag = Boolean(currentSlug && configuredSlugs.includes(currentSlug));

        if (isLifeTag && introEl && typeof lifeCfg?.kicker === 'string') {
            const kickerEl = introEl.querySelector('.ag-life-kicker');
            if (kickerEl) {
                const txt = lifeCfg.kicker.trim();
                kickerEl.textContent = txt;
                kickerEl.hidden = !txt;
            }
        }

        const lifeTitleEl = document.getElementById('ag-life-title');
        if (lifeTitleEl && typeof lifeCfg?.listHeading === 'string') {
            const txt = lifeCfg.listHeading.trim();
            lifeTitleEl.textContent = txt;
            lifeTitleEl.hidden = !txt;
            if (lifeTitleEl.parentElement?.classList.contains('ag-life-journal-head')) {
                lifeTitleEl.parentElement.hidden = !txt;
            }
        }

        if (isLifeTag) {
            const nav = document.querySelector('.ag-life-tags-panel nav');
            if (nav) {
                const hasAllLife = [...nav.querySelectorAll('a')].some((a) => {
                    try {
                        return new URL(a.getAttribute('href') || '', location.origin).pathname.replace(/\/+$/, '') === '/life';
                    } catch {
                        return false;
                    }
                });
                if (!hasAllLife) {
                    const allLink = document.createElement('a');
                    allLink.href = '/life/';
                    allLink.textContent = '全部生活';
                    nav.prepend(allLink);
                }
            }
        }
    }

    const dialog = document.getElementById('ag-social-dialog');
    const titleEl = document.getElementById('ag-social-dialog-title');
    const bodyEl = document.getElementById('ag-social-dialog-body');
    if (!dialog || !titleEl || !bodyEl) return;

    const socialCfg = window.__AG_SITE_CONFIG__?.social;
    const wechat = socialCfg !== undefined ? String(socialCfg.wechat || '').trim() : '';
    const emails = socialCfg !== undefined
        ? (Array.isArray(socialCfg.emails) ? socialCfg.emails.map((e) => String(e || '').trim()).filter(Boolean) : [])
        : [];
    const rawGithubUrl = socialCfg !== undefined ? String(socialCfg.githubUrl || '').trim() : '';
    const safeGithub = safeHref(rawGithubUrl);
    const githubUrl = safeGithub !== '#' ? safeGithub : '';
    const githubLabel = socialCfg !== undefined ? String(socialCfg.githubLabel || '').trim() : '';

    const CONTACTS = {
        wechat: wechat ? {
            title: '微信',
            items: [{ label: wechat, copy: wechat }],
            ariaLabel: '微信：' + wechat,
            buttonTitle: '微信：' + wechat
        } : null,
        mail: emails.length ? {
            title: '电子邮箱',
            items: emails.map((email) => {
                const mailHref = safeHref('mailto:' + email);
                return {
                    label: email,
                    copy: email,
                    href: mailHref !== '#' ? mailHref : '',
                    actionText: '发邮件'
                };
            }),
            ariaLabel: '邮箱联系',
            buttonTitle: '邮箱：' + emails.join(' / ')
        } : null,
        github: githubUrl ? {
            title: 'GitHub',
            items: [
                { label: githubUrl, copy: githubUrl, href: githubUrl, actionText: '跳转', external: true }
            ],
            ariaLabel: githubLabel ? 'GitHub: ' + githubLabel : 'GitHub 主页',
            buttonTitle: githubLabel ? 'GitHub: ' + githubLabel : 'GitHub 主页'
        } : null
    };

    function copyText(text, btn) {
        const prev = btn.textContent;
        const done = () => {
            btn.textContent = '已复制 ✓';
            setTimeout(() => { btn.textContent = prev; }, 1600);
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done, done);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch {}
            ta.remove();
            done();
        }
    }

    let visibleSocialCount = 0;
    document.querySelectorAll('[data-ag-social]').forEach((trigger) => {
        const channel = trigger.dataset.agSocial;
        const cfg = CONTACTS[channel];
        if (!cfg || !cfg.items.length) {
            trigger.hidden = true;
            return;
        }
        visibleSocialCount++;
        trigger.hidden = false;
        trigger.setAttribute('aria-label', cfg.ariaLabel);
        trigger.title = cfg.buttonTitle;

        trigger.addEventListener('click', () => {
            titleEl.textContent = cfg.title;
            bodyEl.innerHTML = '';
            cfg.items.forEach((item) => {
                const row = document.createElement('div');
                row.className = 'ag-social-row';
                const val = document.createElement('span');
                val.className = 'ag-social-val';
                val.textContent = item.label;
                const btns = document.createElement('div');
                btns.className = 'ag-social-btns';
                const cp = document.createElement('button');
                cp.type = 'button';
                cp.className = 'ag-social-btn' + (item.href ? '' : ' is-primary');
                cp.textContent = '复制';
                cp.addEventListener('click', () => copyText(item.copy, cp));
                btns.appendChild(cp);
                if (item.href) {
                    const cleanHref = safeHref(item.href);
                    if (cleanHref !== '#') {
                        const link = document.createElement('a');
                        link.className = 'ag-social-btn is-primary';
                        link.href = cleanHref;
                        if (item.external) {
                            link.target = '_blank';
                            link.rel = 'noopener noreferrer';
                        }
                        link.textContent = item.actionText || '跳转';
                        btns.appendChild(link);
                    }
                }
                row.append(val, btns);
                bodyEl.appendChild(row);
            });
            dialog.showModal();
        });
    });

    const socialWrap = document.querySelector('.ag-footer-social');
    if (socialWrap && visibleSocialCount === 0) socialWrap.hidden = true;

    dialog.querySelector('[data-ag-social-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
})();
