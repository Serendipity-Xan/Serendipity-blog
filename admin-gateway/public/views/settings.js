import { api } from '../api.js';
import { openMediaPicker } from '../components/media-picker.js';
import {
    escapeHtml,
    escapeAttr,
    formatDate,
    moveItem,
    cloneDeep,
    openModal,
    closeModal,
    confirmModal,
    toast
} from '../utils.js';

function parseNavSetting(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((x) => ({ label: x.label || '', url: x.url || '' }));
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.map((x) => ({ label: x.label || '', url: x.url || '' })) : [];
    } catch {
        return [];
    }
}

export async function renderSettingsView(container, ctx, options = {}) {
    ctx.setTopbar('站点与站长设置', '管理站点基础信息、导航菜单、页脚社交、标签及站长个人资料', '');
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载站点设置…</span></div>`;

    let settingsMap = {};
    let siteConfig = null;
    let tags = [];
    let currentUser = null;
    let activeTab = options.tab || 'site'; // site | social | profile | team

    try {
        const [settingsList, cfg, loadedTags, user] = await Promise.all([
            api.getSettings(),
            api.getSiteConfig(),
            api.listTags(),
            api.getCurrentUser()
        ]);
        for (const item of settingsList) {
            settingsMap[item.key] = item.value;
        }
        siteConfig = cloneDeep(cfg);
        tags = loadedTags || [];
        currentUser = user;
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载站点设置失败：${escapeHtml(err.message)}</div>`;
        return;
    }

    const fallbackBrand = ctx.getAdminBrand?.() || {};
    const adminState = {
        title: siteConfig.admin?.title ?? fallbackBrand.title ?? 'Serendipity',
        subtitle: siteConfig.admin?.subtitle ?? fallbackBrand.subtitle ?? '中文管理台',
        loginSubtitle: siteConfig.admin?.loginSubtitle ?? fallbackBrand.loginSubtitle ?? '中文内容与外观控制中心',
        brandMark: siteConfig.admin?.brandMark ?? fallbackBrand.brandMark ?? 'S'
    };

    const siteState = {
        title: settingsMap.title || '',
        description: settingsMap.description || '',
        meta_title: settingsMap.meta_title || '',
        meta_description: settingsMap.meta_description || '',
        icon: settingsMap.icon || '',
        cover_image: settingsMap.cover_image || '',
        facebook: settingsMap.facebook || '',
        twitter: settingsMap.twitter || '',
        navigation: parseNavSetting(settingsMap.navigation),
        secondary_navigation: parseNavSetting(settingsMap.secondary_navigation)
    };

    const socialState = {
        wechat: siteConfig.social?.wechat || '',
        emails: Array.isArray(siteConfig.social?.emails) ? [...siteConfig.social.emails] : [],
        githubUrl: siteConfig.social?.githubUrl || '',
        githubLabel: siteConfig.social?.githubLabel || ''
    };

    const userState = currentUser
        ? {
            id: currentUser.id,
            updated_at: currentUser.updated_at,
            name: currentUser.name || '',
            slug: currentUser.slug || '',
            bio: currentUser.bio || '',
            location: currentUser.location || '',
            website: currentUser.website || '',
            profile_image: currentUser.profile_image || ''
        }
        : null;

    const renderShell = () => {
        container.innerHTML = `
            <div style="margin-bottom:18px;">
                <div class="tabs" id="settings-tabs">
                    <button type="button" class="tab-btn ${activeTab === 'site' ? 'active' : ''}" data-tab="site">站点信息与导航</button>
                    <button type="button" class="tab-btn ${activeTab === 'social' ? 'active' : ''}" data-tab="social">页脚社交方式</button>
                    <button type="button" class="tab-btn ${activeTab === 'profile' ? 'active' : ''}" data-tab="profile">标签管理与站长资料</button>
                    <button type="button" class="tab-btn ${activeTab === 'team' ? 'active' : ''}" data-tab="team">团队成员与密码</button>
                </div>
            </div>
            <div id="settings-tab-body"></div>
        `;

        container.querySelector('#settings-tabs').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-tab]');
            if (!btn) return;
            activeTab = btn.dataset.tab;
            container.querySelectorAll('#settings-tabs .tab-btn').forEach((b) => {
                b.classList.toggle('active', b.dataset.tab === activeTab);
            });
            renderActiveTab();
        });

        renderActiveTab();
    };

    const renderActiveTab = () => {
        const body = container.querySelector('#settings-tab-body');
        if (!body) return;
        if (activeTab === 'site') renderSiteTab(body);
        else if (activeTab === 'social') renderSocialTab(body);
        else if (activeTab === 'team') renderTeamTab(body);
        else renderProfileTab(body);
    };

    /* ==================== Tab 1: 站点信息与导航 ==================== */
    const renderSiteTab = (root) => {
        root.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">管理台名称与品牌标识</h3>
                        <p class="card-desc">自定义本管理台的左上角名称、角标与登录页欢迎文案，保存后立即生效</p>
                    </div>
                </div>
                <div class="card-body">
                    <div class="form-grid">
                        <div class="field">
                            <label for="adm-title">管理台名称</label>
                            <div class="input-with-actions">
                                <input type="text" id="adm-title" maxlength="40" value="${escapeAttr(adminState.title)}" placeholder="Serendipity">
                                <button type="button" class="btn btn-sm" id="adm-sync-site-title">同步站点标题</button>
                            </div>
                        </div>
                        <div class="field">
                            <label for="adm-mark">品牌角标文字（1-2字）</label>
                            <input type="text" id="adm-mark" maxlength="2" value="${escapeAttr(adminState.brandMark)}" placeholder="S">
                        </div>
                        <div class="field">
                            <label for="adm-subtitle">管理台副标题</label>
                            <input type="text" id="adm-subtitle" maxlength="40" value="${escapeAttr(adminState.subtitle)}" placeholder="中文管理台">
                        </div>
                        <div class="field">
                            <label for="adm-login-sub">登录页副标题</label>
                            <input type="text" id="adm-login-sub" maxlength="80" value="${escapeAttr(adminState.loginSubtitle)}" placeholder="中文内容与外观控制中心">
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <span class="field-hint">修改后将实时更新侧边栏、登录页与浏览器标签页标题</span>
                    <button type="button" class="btn btn-primary" id="adm-brand-save">保存管理台品牌</button>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">站点基础信息</h3>
                        <p class="card-desc">控制浏览器标签页标题、SEO 简介、站点图标（Favicon）与默认分享封面图</p>
                    </div>
                </div>
                <div class="card-body">
                    <div class="form-grid">
                        <div class="field">
                            <label for="st-title">站点标题</label>
                            <input type="text" id="st-title" maxlength="150" value="${escapeAttr(siteState.title)}" placeholder="输入站点标题">
                        </div>
                        <div class="field">
                            <label for="st-desc">站点简介</label>
                            <input type="text" id="st-desc" maxlength="200" value="${escapeAttr(siteState.description)}" placeholder="一句话介绍你的博客">
                        </div>
                        <div class="field">
                            <label for="st-meta-title">SEO 标题（可选）</label>
                            <input type="text" id="st-meta-title" maxlength="300" value="${escapeAttr(siteState.meta_title)}" placeholder="留空时使用站点标题">
                            <p class="field-hint">用于搜索引擎与社交分享的自定义标题</p>
                        </div>
                        <div class="field">
                            <label for="st-meta-desc">SEO 描述（可选；留空时回退站点简介）</label>
                            <input type="text" id="st-meta-desc" maxlength="500" value="${escapeAttr(siteState.meta_description)}" placeholder="留空时自动回退为上方「站点简介」">
                            <p class="field-hint">若此处非空，将覆盖网页 <code>&lt;meta name="description"&gt;</code></p>
                        </div>

                        <div class="field">
                            <label for="st-icon">站点图标（Favicon）</label>
                            <div class="input-with-actions">
                                <input type="text" id="st-icon" value="${escapeAttr(siteState.icon)}" placeholder="/content/images/...">
                                <label class="btn btn-sm" style="cursor:pointer;">
                                    上传
                                    <input type="file" id="st-icon-upload" accept="image/*" class="hidden">
                                </label>
                                <button type="button" class="btn btn-sm" id="st-icon-pick">图库</button>
                                <button type="button" class="btn btn-ghost btn-sm" id="st-icon-clear">清除</button>
                            </div>
                            ${siteState.icon ? `<img src="${escapeAttr(siteState.icon)}" alt="站点图标预览" style="width:40px;height:40px;border-radius:8px;border:1px solid var(--border);object-fit:cover;margin-top:6px;">` : ''}
                        </div>

                        <div class="field">
                            <label for="st-cover">站点默认封面图</label>
                            <div class="input-with-actions">
                                <input type="text" id="st-cover" value="${escapeAttr(siteState.cover_image)}" placeholder="/content/images/...">
                                <label class="btn btn-sm" style="cursor:pointer;">
                                    上传
                                    <input type="file" id="st-cover-upload" accept="image/*" class="hidden">
                                </label>
                                <button type="button" class="btn btn-sm" id="st-cover-pick">图库</button>
                                <button type="button" class="btn btn-ghost btn-sm" id="st-cover-clear">清除</button>
                            </div>
                            ${siteState.cover_image ? `<img src="${escapeAttr(siteState.cover_image)}" alt="站点封面预览" style="height:64px;border-radius:8px;border:1px solid var(--border);object-fit:cover;margin-top:6px;">` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">顶部主导航菜单</h3>
                        <p class="card-desc">展示在博客顶部导航栏中的链接，可自由修改文案、路径或调整顺序</p>
                    </div>
                    <button type="button" class="btn btn-sm" id="st-add-primary-nav">+ 添加导航项</button>
                </div>
                <div class="card-body">
                    <div id="st-primary-nav-list" class="repeater-list"></div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">页脚辅助导航菜单</h3>
                        <p class="card-desc">展示在博客页脚底部的快捷导航链接</p>
                    </div>
                    <button type="button" class="btn btn-sm" id="st-add-sec-nav">+ 添加页脚链接</button>
                </div>
                <div class="card-body">
                    <div id="st-sec-nav-list" class="repeater-list"></div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">默认社交分享元数据（Open Graph / Twitter Card）</h3>
                        <p class="card-desc">Ghost 默认带有 <code>ghost</code> / <code>@ghost</code> 占位账号，建议留空或改成你自己的账号</p>
                    </div>
                    <button type="button" class="btn btn-sm" id="st-clear-ghost-social">一键清空默认 @ghost</button>
                </div>
                <div class="card-body">
                    <div class="form-grid">
                        <div class="field">
                            <label for="st-facebook">Facebook 主页用户名</label>
                            <input type="text" id="st-facebook" value="${escapeAttr(siteState.facebook)}" placeholder="留空表示不输出">
                        </div>
                        <div class="field">
                            <label for="st-twitter">Twitter / X 用户名</label>
                            <input type="text" id="st-twitter" value="${escapeAttr(siteState.twitter)}" placeholder="例如 @yourname，留空表示不输出">
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <span class="field-hint">所有站点基础信息和导航会同步写入 Ghost 设置</span>
                    <button type="button" class="btn btn-primary" id="st-save-btn">保存站点与导航设置</button>
                </div>
            </div>
        `;

        const renderNavList = (elId, arr) => {
            const listEl = root.querySelector(elId);
            if (arr.length === 0) {
                listEl.innerHTML = `<div class="empty-state" style="padding:18px;"><p>暂无导航项</p></div>`;
                return;
            }
            listEl.innerHTML = arr.map((item, idx) => `
                <div class="repeater-row repeater-nav" data-idx="${idx}">
                    <input type="text" data-field="label" value="${escapeAttr(item.label)}" placeholder="显示名称，如：文章">
                    <input type="text" data-field="url" value="${escapeAttr(item.url)}" placeholder="跳转路径，如：/articles/">
                    <div class="toolbar-group" style="gap:4px;">
                        <button type="button" class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" class="icon-btn" data-action="down" ${idx === arr.length - 1 ? 'disabled' : ''}>↓</button>
                        <button type="button" class="btn btn-danger-soft btn-xs" data-action="remove">删除</button>
                    </div>
                </div>
            `).join('');

            listEl.querySelectorAll('.repeater-row').forEach((row) => {
                const idx = Number(row.dataset.idx);
                row.querySelector('[data-field="label"]').addEventListener('input', (e) => { arr[idx].label = e.target.value; });
                row.querySelector('[data-field="url"]').addEventListener('input', (e) => { arr[idx].url = e.target.value; });
                row.querySelector('[data-action="up"]').addEventListener('click', () => {
                    if (moveItem(arr, idx, -1)) renderNavList(elId, arr);
                });
                row.querySelector('[data-action="down"]').addEventListener('click', () => {
                    if (moveItem(arr, idx, 1)) renderNavList(elId, arr);
                });
                row.querySelector('[data-action="remove"]').addEventListener('click', () => {
                    arr.splice(idx, 1);
                    renderNavList(elId, arr);
                });
            });
        };

        renderNavList('#st-primary-nav-list', siteState.navigation);
        renderNavList('#st-sec-nav-list', siteState.secondary_navigation);

        const buildAdminBrandPayload = () => ({
            title: adminState.title.trim() || 'Serendipity',
            subtitle: adminState.subtitle.trim(),
            loginSubtitle: adminState.loginSubtitle.trim() || '中文内容与外观控制中心',
            brandMark: adminState.brandMark.trim().slice(0, 2) || 'S'
        });

        const saveAdminBrand = async () => {
            const adminPayload = buildAdminBrandPayload();
            const saved = await api.patchSiteConfig({ admin: adminPayload });
            siteConfig = cloneDeep(saved?.config || { ...siteConfig, admin: adminPayload });
            const applied = saved?.config?.admin || adminPayload;
            adminState.title = applied.title;
            adminState.subtitle = applied.subtitle;
            adminState.loginSubtitle = applied.loginSubtitle;
            adminState.brandMark = applied.brandMark;
            ctx.applyAdminBrand?.(applied);
            return applied;
        };

        root.querySelector('#adm-title').addEventListener('input', (e) => { adminState.title = e.target.value; });
        root.querySelector('#adm-subtitle').addEventListener('input', (e) => { adminState.subtitle = e.target.value; });
        root.querySelector('#adm-login-sub').addEventListener('input', (e) => { adminState.loginSubtitle = e.target.value; });
        root.querySelector('#adm-mark').addEventListener('input', (e) => { adminState.brandMark = e.target.value; });
        root.querySelector('#adm-sync-site-title').addEventListener('click', () => {
            const val = root.querySelector('#st-title').value.trim();
            if (!val) {
                toast('请先在下方填写站点标题', 'warning');
                return;
            }
            adminState.title = val;
            root.querySelector('#adm-title').value = val;
            toast('已同步站点标题到管理台名称', 'info');
        });
        root.querySelector('#adm-brand-save').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = '保存中…';
            try {
                await saveAdminBrand();
                toast('管理台品牌设置已保存并立即生效', 'success');
            } catch (err) {
                toast(`保存管理台品牌失败：${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '保存管理台品牌';
            }
        });

        root.querySelector('#st-title').addEventListener('input', (e) => { siteState.title = e.target.value; });
        root.querySelector('#st-desc').addEventListener('input', (e) => { siteState.description = e.target.value; });
        root.querySelector('#st-meta-title').addEventListener('input', (e) => { siteState.meta_title = e.target.value; });
        root.querySelector('#st-meta-desc').addEventListener('input', (e) => { siteState.meta_description = e.target.value; });
        root.querySelector('#st-icon').addEventListener('change', (e) => { siteState.icon = e.target.value.trim(); renderSiteTab(root); });
        root.querySelector('#st-cover').addEventListener('change', (e) => { siteState.cover_image = e.target.value.trim(); renderSiteTab(root); });
        root.querySelector('#st-facebook').addEventListener('input', (e) => { siteState.facebook = e.target.value.trim(); });
        root.querySelector('#st-twitter').addEventListener('input', (e) => { siteState.twitter = e.target.value.trim(); });

        root.querySelector('#st-icon-upload').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
                const up = await api.uploadImage(file);
                siteState.icon = up.url;
                renderSiteTab(root);
                toast('站点图标已上传，记得点击保存', 'success');
            } catch (err) {
                toast(`上传失败：${err.message}`, 'error');
            }
        });
        root.querySelector('#st-icon-pick').addEventListener('click', () => {
            openMediaPicker({
                title: '选择站点图标',
                onSelect(url) { siteState.icon = url; renderSiteTab(root); }
            });
        });
        root.querySelector('#st-icon-clear').addEventListener('click', () => { siteState.icon = ''; renderSiteTab(root); });

        root.querySelector('#st-cover-upload').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
                const up = await api.uploadImage(file);
                siteState.cover_image = up.url;
                renderSiteTab(root);
                toast('站点封面已上传，记得点击保存', 'success');
            } catch (err) {
                toast(`上传失败：${err.message}`, 'error');
            }
        });
        root.querySelector('#st-cover-pick').addEventListener('click', () => {
            openMediaPicker({
                title: '选择站点默认封面图',
                onSelect(url) { siteState.cover_image = url; renderSiteTab(root); }
            });
        });
        root.querySelector('#st-cover-clear').addEventListener('click', () => { siteState.cover_image = ''; renderSiteTab(root); });

        root.querySelector('#st-add-primary-nav').addEventListener('click', () => {
            siteState.navigation.push({ label: '新菜单', url: '/' });
            renderNavList('#st-primary-nav-list', siteState.navigation);
        });
        root.querySelector('#st-add-sec-nav').addEventListener('click', () => {
            siteState.secondary_navigation.push({ label: '页脚链接', url: '/' });
            renderNavList('#st-sec-nav-list', siteState.secondary_navigation);
        });

        root.querySelector('#st-clear-ghost-social').addEventListener('click', () => {
            siteState.facebook = '';
            siteState.twitter = '';
            root.querySelector('#st-facebook').value = '';
            root.querySelector('#st-twitter').value = '';
            toast('已清空 Facebook 和 Twitter 字段，请点击下方保存生效', 'info');
        });

        root.querySelector('#st-save-btn').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const normalizeNav = (arr) => {
                const cleaned = [];
                for (const item of arr) {
                    const label = (item.label || '').trim();
                    if (!label) continue;
                    let url = (item.url || '').trim();
                    if (!url) {
                        url = '/';
                    } else if (/\s/.test(url)) {
                        toast(`导航项「${label}」的链接地址不能包含空格，请检查后重试`, 'warning');
                        return null;
                    } else if (!/^(\/|#|https?:\/\/|mailto:)/i.test(url)) {
                        url = `/${url}`;
                    }
                    cleaned.push({ label, url });
                }
                return cleaned;
            };

            const primaryNav = normalizeNav(siteState.navigation);
            if (!primaryNav) return;
            const secondaryNav = normalizeNav(siteState.secondary_navigation);
            if (!secondaryNav) return;

            btn.disabled = true;
            btn.textContent = '保存中…';
            try {
                const payload = [
                    { key: 'title', value: siteState.title.trim() },
                    { key: 'description', value: siteState.description.trim() },
                    { key: 'meta_title', value: siteState.meta_title.trim() || null },
                    { key: 'meta_description', value: siteState.meta_description.trim() || null },
                    { key: 'icon', value: siteState.icon.trim() || null },
                    { key: 'cover_image', value: siteState.cover_image.trim() || null },
                    { key: 'facebook', value: siteState.facebook.trim() || null },
                    { key: 'twitter', value: siteState.twitter.trim() || null },
                    { key: 'navigation', value: JSON.stringify(primaryNav) },
                    { key: 'secondary_navigation', value: JSON.stringify(secondaryNav) }
                ];
                await Promise.all([
                    api.saveSettings(payload),
                    saveAdminBrand()
                ]);
                siteState.navigation = primaryNav;
                siteState.secondary_navigation = secondaryNav;
                renderNavList('#st-primary-nav-list', siteState.navigation);
                renderNavList('#st-sec-nav-list', siteState.secondary_navigation);
                toast('站点信息与导航已保存', 'success');
            } catch (err) {
                toast(`保存失败：${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '保存站点与导航设置';
            }
        });
    };

    /* ==================== Tab 2: 页脚社交方式 ==================== */
    const renderSocialTab = (root) => {
        root.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">页脚社交图标与联系方式</h3>
                        <p class="card-desc">直接控制博客前台页脚展示的微信、邮箱与 GitHub 图标及点击弹窗内容；某项留空时前台会自动隐藏该图标</p>
                    </div>
                </div>
                <div class="card-body">
                    <div class="form-grid">
                        <div class="field">
                            <label for="soc-wechat">微信号</label>
                            <input type="text" id="soc-wechat" value="${escapeAttr(socialState.wechat)}" placeholder="例如：your_wechat_id（留空则隐藏微信图标）">
                            <p class="field-hint">访客点击页脚微信图标后会弹出该微信号供一键复制</p>
                        </div>
                        <div class="field">
                            <label for="soc-gh-label">GitHub 展示名</label>
                            <input type="text" id="soc-gh-label" value="${escapeAttr(socialState.githubLabel)}" placeholder="例如：your-github-id">
                        </div>
                        <div class="field col-span-2">
                            <label for="soc-gh-url">GitHub 主页链接</label>
                            <input type="url" id="soc-gh-url" value="${escapeAttr(socialState.githubUrl)}" placeholder="https://github.com/your-id（留空则隐藏 GitHub 图标）">
                        </div>
                        <div class="field col-span-2">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                                <label style="margin:0;">电子邮箱列表（支持添加多个常用邮箱）</label>
                                <button type="button" class="btn btn-xs" id="soc-add-email">+ 添加邮箱</button>
                            </div>
                            <div id="soc-email-list" class="repeater-list"></div>
                            <p class="field-hint">清空所有邮箱时，前台页脚将自动隐藏邮箱图标</p>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <span class="field-hint">保存后刷新任意前台页面即可看到页脚更新</span>
                    <button type="button" class="btn btn-primary" id="soc-save-btn">保存社交联系方式</button>
                </div>
            </div>
        `;

        const renderEmails = () => {
            const listEl = root.querySelector('#soc-email-list');
            if (socialState.emails.length === 0) {
                listEl.innerHTML = `<div class="empty-state" style="padding:16px;"><p>未配置邮箱，点击右上角「添加邮箱」增加联系方式</p></div>`;
                return;
            }
            listEl.innerHTML = socialState.emails.map((email, idx) => `
                <div class="repeater-row repeater-email" data-idx="${idx}">
                    <input type="email" value="${escapeAttr(email)}" placeholder="name@example.com">
                    <button type="button" class="btn btn-danger-soft btn-xs" data-remove>删除</button>
                </div>
            `).join('');

            listEl.querySelectorAll('.repeater-row').forEach((row) => {
                const idx = Number(row.dataset.idx);
                row.querySelector('input').addEventListener('input', (e) => { socialState.emails[idx] = e.target.value; });
                row.querySelector('[data-remove]').addEventListener('click', () => {
                    socialState.emails.splice(idx, 1);
                    renderEmails();
                });
            });
        };

        renderEmails();

        root.querySelector('#soc-wechat').addEventListener('input', (e) => { socialState.wechat = e.target.value; });
        root.querySelector('#soc-gh-label').addEventListener('input', (e) => { socialState.githubLabel = e.target.value; });
        root.querySelector('#soc-gh-url').addEventListener('input', (e) => { socialState.githubUrl = e.target.value; });
        root.querySelector('#soc-add-email').addEventListener('click', () => {
            socialState.emails.push('');
            renderEmails();
        });

        root.querySelector('#soc-save-btn').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = '保存中…';
            try {
                const patch = {
                    social: {
                        wechat: socialState.wechat.trim(),
                        emails: socialState.emails.map((x) => x.trim()).filter(Boolean),
                        githubUrl: socialState.githubUrl.trim(),
                        githubLabel: socialState.githubLabel.trim()
                    }
                };
                const res = await api.patchSiteConfig(patch);
                siteConfig = cloneDeep(res?.config || { ...siteConfig, ...patch });
                socialState.emails = [...(siteConfig.social?.emails || [])];
                renderEmails();
                toast('页脚社交方式已保存', 'success');
            } catch (err) {
                toast(`保存失败：${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '保存社交联系方式';
            }
        });
    };

    /* ==================== Tab 3: 标签管理与站长资料 ==================== */
    const openTagModal = (tag = null) => {
        const isEdit = Boolean(tag);
        openModal({
            title: isEdit ? `编辑标签：${tag.name}` : '新建文章标签',
            bodyHtml: `
                <div class="form-grid">
                    <div class="field">
                        <label for="tm-name">标签名称 *</label>
                        <input type="text" id="tm-name" value="${escapeAttr(tag?.name || '')}" placeholder="例如：前端开发">
                    </div>
                    <div class="field">
                        <label for="tm-slug">标签路径（Slug）</label>
                        <input type="text" id="tm-slug" value="${escapeAttr(tag?.slug || '')}" placeholder="例如：frontend（留空自动生成）">
                    </div>
                    <div class="field col-span-2">
                        <label for="tm-desc">标签简介（可选）</label>
                        <textarea id="tm-desc" rows="2" maxlength="500" placeholder="展示在标签归档页顶部的简短介绍">${escapeHtml(tag?.description || '')}</textarea>
                    </div>
                </div>
            `,
            footerHtml: `
                <button type="button" class="btn" data-modal-close>取消</button>
                <button type="button" class="btn btn-primary" id="tm-save">${isEdit ? '保存修改' : '确认创建'}</button>
            `,
            onMount(dialog) {
                dialog.querySelector('#tm-save').addEventListener('click', async (e) => {
                    const name = dialog.querySelector('#tm-name').value.trim();
                    const slug = dialog.querySelector('#tm-slug').value.trim();
                    const description = dialog.querySelector('#tm-desc').value.trim();
                    if (!name) {
                        toast('请输入标签名称', 'warning');
                        return;
                    }
                    if (name.startsWith(',')) {
                        toast('标签名称不能以英文逗号开头', 'warning');
                        dialog.querySelector('#tm-name').focus();
                        return;
                    }
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    try {
                        const payload = { name, description: description || null };
                        if (slug) payload.slug = slug;
                        if (isEdit) {
                            const updated = await api.updateTag(tag.id, payload);
                            const idx = tags.findIndex((t) => t.id === tag.id);
                            if (idx !== -1 && updated) tags[idx] = { ...tags[idx], ...updated };
                            toast('标签已更新', 'success');
                        } else {
                            const created = await api.createTag(payload);
                            if (created) tags.push({ ...created, count: { posts: 0 } });
                            toast('标签已创建', 'success');
                        }
                        closeModal();
                        renderActiveTab();
                    } catch (err) {
                        toast(`保存标签失败：${err.message}`, 'error');
                        btn.disabled = false;
                    }
                });
            }
        });
    };

    const renderProfileTab = (root) => {
        root.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">文章标签管理（共 ${tags.length} 个）</h3>
                        <p class="card-desc">管理全站文章分类标签，标签路径（Slug）用于驱动「生活」「工具箱」等专题栏目筛选</p>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" id="st-new-tag-btn">+ 新建标签</button>
                </div>
                <div class="table-wrap">
                    ${tags.length === 0 ? `
                        <div class="empty-state"><p>暂无标签</p></div>
                    ` : `
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>标签名称</th>
                                    <th>路径（Slug）</th>
                                    <th>简介</th>
                                    <th>关联文章数</th>
                                    <th style="text-align:right;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tags.map((t) => `
                                    <tr data-tag-id="${escapeAttr(t.id)}">
                                        <td style="font-weight:600;">${escapeHtml(t.name)}</td>
                                        <td><code>${escapeHtml(t.slug)}</code></td>
                                        <td style="color:var(--muted);max-width:260px;">${escapeHtml(t.description || '—')}</td>
                                        <td><span class="pill pill-muted">${t.count?.posts ?? 0} 篇</span></td>
                                        <td>
                                            <div class="row-actions">
                                                <a href="/tag/${escapeAttr(t.slug)}/" target="_blank" rel="noopener" class="btn btn-ghost btn-xs">查看 ↗</a>
                                                <button type="button" class="btn btn-sm" data-action="edit-tag">编辑</button>
                                                <button type="button" class="btn btn-danger-soft btn-xs" data-action="del-tag">删除</button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>

            ${userState ? `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">站长个人资料</h3>
                        <p class="card-desc">同步展示在作者主页 <code>/author/${escapeHtml(userState.slug || 'author')}/</code> 与文章顶部署名</p>
                    </div>
                    <a href="/author/${escapeAttr(userState.slug || 'author')}/" target="_blank" rel="noopener" class="btn btn-sm">查看作者页 ↗</a>
                </div>
                <div class="card-body">
                    <div class="form-grid">
                        <div class="field">
                            <label for="u-name">站长昵称</label>
                            <input type="text" id="u-name" value="${escapeAttr(userState.name)}" placeholder="请输入昵称">
                        </div>
                        <div class="field">
                            <label for="u-slug">作者主页路径（Slug）</label>
                            <input type="text" id="u-slug" value="${escapeAttr(userState.slug)}" placeholder="author">
                        </div>
                        <div class="field">
                            <label for="u-location">所在地</label>
                            <input type="text" id="u-location" value="${escapeAttr(userState.location)}" placeholder="例如：上海 / Tokyo">
                        </div>
                        <div class="field">
                            <label for="u-website">个人网站 / 主页链接</label>
                            <input type="url" id="u-website" value="${escapeAttr(userState.website)}" placeholder="https://...">
                        </div>
                        <div class="field col-span-2">
                            <label for="u-avatar">站长头像</label>
                            <div style="display:flex;gap:12px;align-items:center;">
                                <div class="friend-icon-preview" style="width:48px;height:48px;">
                                    ${userState.profile_image
                                        ? `<img src="${escapeAttr(userState.profile_image)}" alt="站长头像">`
                                        : escapeHtml((userState.name || '站').slice(0, 1))}
                                </div>
                                <div class="input-with-actions" style="flex:1;">
                                    <input type="text" id="u-avatar" value="${escapeAttr(userState.profile_image)}" placeholder="/content/images/...">
                                    <label class="btn btn-sm" style="cursor:pointer;">
                                        上传
                                        <input type="file" id="u-avatar-upload" accept="image/*" class="hidden">
                                    </label>
                                    <button type="button" class="btn btn-sm" id="u-avatar-pick">图库</button>
                                    <button type="button" class="btn btn-ghost btn-sm" id="u-avatar-clear">清除</button>
                                </div>
                            </div>
                        </div>
                        <div class="field col-span-2">
                            <label for="u-bio" style="justify-content:space-between;">
                                <span>个人简介</span>
                                <span id="u-bio-count" class="field-hint">${userState.bio.length} / 250</span>
                            </label>
                            <textarea id="u-bio" rows="3" maxlength="250" placeholder="同步展示在作者主页与文章顶部署名旁的个人介绍">${escapeHtml(userState.bio)}</textarea>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <span class="field-hint">修改后将同步更新当前登录账号信息与前台作者资料</span>
                    <button type="button" class="btn btn-primary" id="u-save-btn">保存站长资料</button>
                </div>
            </div>
            ` : ''}
        `;

        root.querySelector('#st-new-tag-btn')?.addEventListener('click', () => openTagModal(null));
        root.querySelectorAll('tr[data-tag-id]').forEach((row) => {
            const id = row.dataset.tagId;
            const tag = tags.find((t) => t.id === id);
            if (!tag) return;
            row.querySelector('[data-action="edit-tag"]')?.addEventListener('click', () => openTagModal(tag));
            row.querySelector('[data-action="del-tag"]')?.addEventListener('click', async () => {
                const ok = await confirmModal({
                    title: '删除标签',
                    message: `确定删除标签「${tag.name}」吗？关联的文章不会被删除，仅解除与该标签的关联。`,
                    confirmText: '确认删除',
                    danger: true
                });
                if (!ok) return;
                try {
                    await api.deleteTag(tag.id);
                    tags = tags.filter((t) => t.id !== tag.id);
                    toast('标签已删除', 'success');
                    renderProfileTab(root);
                } catch (err) {
                    toast(`删除标签失败：${err.message}`, 'error');
                }
            });
        });

        if (userState) {
            root.querySelector('#u-name').addEventListener('input', (e) => { userState.name = e.target.value; });
            root.querySelector('#u-slug').addEventListener('input', (e) => { userState.slug = e.target.value.trim(); });
            root.querySelector('#u-location').addEventListener('input', (e) => { userState.location = e.target.value; });
            root.querySelector('#u-website').addEventListener('input', (e) => { userState.website = e.target.value; });
            const bioCountEl = root.querySelector('#u-bio-count');
            root.querySelector('#u-bio').addEventListener('input', (e) => {
                userState.bio = e.target.value;
                if (bioCountEl) bioCountEl.textContent = `${userState.bio.length} / 250`;
            });
            root.querySelector('#u-avatar').addEventListener('change', (e) => {
                userState.profile_image = e.target.value.trim();
                renderProfileTab(root);
            });

            root.querySelector('#u-avatar-upload').addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                    const up = await api.uploadImage(file);
                    userState.profile_image = up.url;
                    renderProfileTab(root);
                    toast('头像上传成功，请点击下方保存生效', 'success');
                } catch (err) {
                    toast(`上传失败：${err.message}`, 'error');
                }
            });
            root.querySelector('#u-avatar-pick').addEventListener('click', () => {
                openMediaPicker({
                    title: '选择站长头像',
                    onSelect(url) {
                        userState.profile_image = url;
                        renderProfileTab(root);
                    }
                });
            });
            root.querySelector('#u-avatar-clear').addEventListener('click', () => {
                userState.profile_image = '';
                renderProfileTab(root);
            });

            root.querySelector('#u-save-btn').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                if (!userState.name.trim()) {
                    toast('请填写站长昵称', 'warning');
                    return;
                }
                const website = userState.website.trim();
                if (website) {
                    let validWebsite = false;
                    try {
                        const parsed = new URL(website);
                        validWebsite = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname) && !/\s/.test(website);
                    } catch {
                        validWebsite = false;
                    }
                    if (!validWebsite) {
                        toast('个人网站链接需以 http:// 或 https:// 开头且格式正确', 'warning');
                        root.querySelector('#u-website')?.focus();
                        return;
                    }
                }
                btn.disabled = true;
                btn.textContent = '保存中…';
                try {
                    const updated = await api.updateUser(userState.id, {
                        name: userState.name.trim(),
                        slug: userState.slug.trim() || undefined,
                        bio: userState.bio.trim() || null,
                        location: userState.location.trim() || null,
                        website: website || null,
                        profile_image: userState.profile_image.trim() || null,
                        updated_at: userState.updated_at
                    });
                    if (updated) {
                        userState.updated_at = updated.updated_at;
                        userState.slug = updated.slug || userState.slug;
                        ctx.updateUserDisplay(updated);
                    }
                    toast('站长资料已更新', 'success');
                    renderProfileTab(root);
                } catch (err) {
                    toast(`保存站长资料失败：${err.message}`, 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = '保存站长资料';
                }
            });
        }
    };

    /* ==================== Tab 4: 团队成员与密码 ==================== */
    let teamUsers = [];
    let teamInvites = [];
    let teamRoles = [];
    let teamLoaded = false;

    const renderTeamTab = async (root) => {
        root.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">修改当前登录密码</h3>
                        <p class="card-desc">更新当前管理员账号的登录密码（Ghost 要求新密码至少 10 位）</p>
                    </div>
                </div>
                <div class="card-body">
                    <div class="hint-banner" style="margin-bottom:16px;">
                        <span>⚠ 修改密码后 Ghost 会自动轮换当前登录会话（若会话失效，系统会引导重新登录）。</span>
                    </div>
                    <div class="form-grid-3">
                        <div class="field">
                            <label for="pwd-old">当前密码</label>
                            <input type="password" id="pwd-old" autocomplete="current-password" placeholder="请输入当前密码">
                        </div>
                        <div class="field">
                            <label for="pwd-new">新密码（至少 10 位）</label>
                            <input type="password" id="pwd-new" minlength="10" autocomplete="new-password" placeholder="至少 10 位字符">
                        </div>
                        <div class="field">
                            <label for="pwd-new2">确认新密码</label>
                            <input type="password" id="pwd-new2" minlength="10" autocomplete="new-password" placeholder="再次输入新密码">
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <span class="field-hint">建议使用字母、数字与符号组合的强密码</span>
                    <button type="button" class="btn btn-primary" id="pwd-save-btn">修改密码</button>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">团队成员列表 & 邀请成员</h3>
                        <p class="card-desc">查看现有后台成员与待接受邀请，并向新成员发送邮件邀请</p>
                    </div>
                    <button type="button" class="btn btn-sm" id="team-refresh-btn">刷新列表</button>
                </div>
                <div class="card-body" id="team-body">
                    <div class="loading-state" style="padding:24px;"><div class="spinner"></div><span>正在加载团队成员与邀请…</span></div>
                </div>
            </div>
        `;

        root.querySelector('#pwd-save-btn').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            if (!userState?.id) {
                toast('未获取到当前用户信息，请刷新页面后重试', 'error');
                return;
            }
            const oldPw = root.querySelector('#pwd-old').value;
            const newPw = root.querySelector('#pwd-new').value;
            const newPw2 = root.querySelector('#pwd-new2').value;
            if (!oldPw) {
                toast('请输入当前密码', 'warning');
                root.querySelector('#pwd-old').focus();
                return;
            }
            if (newPw.length < 10) {
                toast('新密码长度至少需要 10 位', 'warning');
                root.querySelector('#pwd-new').focus();
                return;
            }
            if (newPw !== newPw2) {
                toast('两次输入的新密码不一致', 'warning');
                root.querySelector('#pwd-new2').focus();
                return;
            }

            btn.disabled = true;
            btn.textContent = '提交中…';
            try {
                await api.changePassword(userState.id, oldPw, newPw, newPw2);
                root.querySelector('#pwd-old').value = '';
                root.querySelector('#pwd-new').value = '';
                root.querySelector('#pwd-new2').value = '';
                toast('密码修改成功，会话已刷新', 'success');
            } catch (err) {
                toast(`修改密码失败：${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '修改密码';
            }
        });

        const loadAndRenderTeam = async (force = false) => {
            const teamBody = root.querySelector('#team-body');
            if (!teamBody) return;
            if (!teamLoaded || force) {
                teamBody.innerHTML = `<div class="loading-state" style="padding:24px;"><div class="spinner"></div><span>正在加载团队成员与邀请…</span></div>`;
                try {
                    const [users, invites, roles] = await Promise.all([
                        api.listUsers(),
                        api.listInvites(),
                        api.listRoles()
                    ]);
                    teamUsers = users || [];
                    teamInvites = invites || [];
                    teamRoles = roles || [];
                    teamLoaded = true;
                } catch (err) {
                    teamBody.innerHTML = `<div class="form-error">加载团队成员失败：${escapeHtml(err.message)}</div>`;
                    return;
                }
            }

            const roleNameMap = new Map(teamRoles.map((r) => [r.id, r.name]));
            const invitableRoles = teamRoles.filter((r) => r.name !== 'Owner');
            const roleOptions = (invitableRoles.length ? invitableRoles : teamRoles)
                .map((r) => `<option value="${escapeAttr(r.id)}">${escapeHtml(r.name)}${r.description ? `（${escapeHtml(r.description)}）` : ''}</option>`)
                .join('');

            teamBody.innerHTML = `
                <div style="margin-bottom:20px;">
                    <h4 style="margin:0 0 10px;font-size:13.5px;color:var(--ink-secondary);">邀请新成员</h4>
                    <div class="form-grid" style="align-items:end;">
                        <div class="field">
                            <label for="invite-email">受邀者邮箱</label>
                            <input type="email" id="invite-email" placeholder="member@example.com">
                        </div>
                        <div class="field">
                            <label for="invite-role">分配角色</label>
                            <div class="input-with-actions">
                                <select id="invite-role">${roleOptions}</select>
                                <button type="button" class="btn btn-primary" id="invite-send-btn">发送邀请</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom:20px;">
                    <h4 style="margin:0 0 10px;font-size:13.5px;color:var(--ink-secondary);">团队成员（${teamUsers.length}）</h4>
                    <div class="table-wrap">
                        ${teamUsers.length === 0 ? `<div class="empty-state" style="padding:18px;"><p>暂无成员</p></div>` : `
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>成员</th>
                                        <th>邮箱</th>
                                        <th>角色</th>
                                        <th>状态</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${teamUsers.map((u) => `
                                        <tr>
                                            <td>
                                                <div style="display:flex;align-items:center;gap:10px;">
                                                    <div class="friend-icon-preview" style="width:30px;height:30px;font-size:12px;">
                                                        ${u.profile_image
                                                            ? `<img src="${escapeAttr(u.profile_image)}" alt="">`
                                                            : escapeHtml((u.name || u.email || 'U').slice(0, 1).toUpperCase())}
                                                    </div>
                                                    <span style="font-weight:600;">${escapeHtml(u.name || '未命名')}</span>
                                                </div>
                                            </td>
                                            <td style="color:var(--muted);">${escapeHtml(u.email || '—')}</td>
                                            <td>
                                                ${(u.roles || []).map((r) => `<span class="pill pill-primary">${escapeHtml(r.name)}</span>`).join(' ') || '<span class="pill pill-muted">—</span>'}
                                            </td>
                                            <td>
                                                <span class="pill ${u.status === 'active' ? 'pill-success' : 'pill-muted'}">
                                                    ${u.status === 'active' ? '正常' : escapeHtml(u.status || '未知')}
                                                </span>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        `}
                    </div>
                </div>

                <div>
                    <h4 style="margin:0 0 10px;font-size:13.5px;color:var(--ink-secondary);">待接受邀请（${teamInvites.length}）</h4>
                    <div class="table-wrap">
                        ${teamInvites.length === 0 ? `<div class="empty-state" style="padding:18px;"><p>当前没有待处理的邀请</p></div>` : `
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>受邀邮箱</th>
                                        <th>角色</th>
                                        <th>过期时间</th>
                                        <th style="text-align:right;">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${teamInvites.map((inv) => `
                                        <tr data-invite-id="${escapeAttr(inv.id)}">
                                            <td style="font-weight:500;">${escapeHtml(inv.email)}</td>
                                            <td><span class="pill pill-primary">${escapeHtml(roleNameMap.get(inv.role_id) || inv.role_id || '—')}</span></td>
                                            <td style="color:var(--muted);font-size:12.5px;">${formatDate(inv.expires)}</td>
                                            <td>
                                                <div class="row-actions">
                                                    <button type="button" class="btn btn-danger-soft btn-xs" data-action="revoke-invite">撤销邀请</button>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        `}
                    </div>
                </div>
            `;

            teamBody.querySelector('#invite-send-btn')?.addEventListener('click', async (e) => {
                const emailInput = teamBody.querySelector('#invite-email');
                const roleSelect = teamBody.querySelector('#invite-role');
                const email = emailInput?.value.trim() || '';
                const role_id = roleSelect?.value || '';
                if (!email) {
                    toast('请输入受邀者邮箱', 'warning');
                    emailInput?.focus();
                    return;
                }
                if (!role_id) {
                    toast('请选择分配角色', 'warning');
                    return;
                }
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = '发送中…';
                try {
                    await api.createInvite({ email, role_id });
                    toast(`已向 ${email} 发送团队邀请`, 'success');
                    await loadAndRenderTeam(true);
                } catch (err) {
                    toast(`发送邀请失败：${err.message}`, 'error');
                    btn.disabled = false;
                    btn.textContent = '发送邀请';
                }
            });

            teamBody.querySelectorAll('[data-action="revoke-invite"]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const row = btn.closest('tr[data-invite-id]');
                    const id = row?.dataset.inviteId;
                    const inv = teamInvites.find((x) => x.id === id);
                    if (!id) return;
                    const ok = await confirmModal({
                        title: '撤销团队邀请',
                        message: `确定撤销发送给 ${inv?.email || '该邮箱'} 的邀请吗？`,
                        confirmText: '确认撤销',
                        danger: true
                    });
                    if (!ok) return;
                    try {
                        await api.deleteInvite(id);
                        toast('邀请已撤销', 'success');
                        await loadAndRenderTeam(true);
                    } catch (err) {
                        toast(`撤销邀请失败：${err.message}`, 'error');
                    }
                });
            });
        };

        root.querySelector('#team-refresh-btn').addEventListener('click', () => loadAndRenderTeam(true));
        await loadAndRenderTeam(false);
    };

    renderShell();
}
