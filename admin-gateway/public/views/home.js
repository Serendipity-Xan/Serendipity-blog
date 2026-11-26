import { api } from '../api.js';
import { openMediaPicker } from '../components/media-picker.js';
import { escapeHtml, escapeAttr, uid, moveItem, cloneDeep, toast } from '../utils.js';

const DOCK_ICONS = [
    { value: 'terminal', label: '终端脚本 (terminal)' },
    { value: 'globe', label: '网页地球 (globe)' },
    { value: 'book', label: '文档书本 (book)' },
    { value: 'link', label: '链接传送 (link)' },
    { value: 'wrench', label: '扳手工具 (wrench)' },
    { value: 'code', label: '代码符号 (code)' },
    { value: 'sparkles', label: '星光闪烁 (sparkles)' },
    { value: 'compass', label: '指南罗盘 (compass)' }
];

export async function renderHomeView(container, ctx) {
    ctx.setTopbar('首页装修', '按前台首页从上到下的结构管理首屏文案、照片墙与工具箱入口', `
        <a href="/" target="_blank" rel="noopener" class="btn btn-sm">查看首页效果 ↗</a>
        <button type="button" class="btn btn-primary btn-sm" id="home-top-save">保存首页设置</button>
    `);

    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在读取首页装修配置…</span></div>`;

    let siteConfig = null;
    let themeSettings = [];
    let themeSettingsFailed = false;

    try {
        const [cfg, customSettings] = await Promise.all([
            api.getSiteConfig(),
            api.getCustomThemeSettings().catch(() => {
                themeSettingsFailed = true;
                return [];
            })
        ]);
        siteConfig = cloneDeep(cfg);
        themeSettings = customSettings || [];
        if (themeSettingsFailed) {
            toast('未能加载 Ghost 主题自定义设置，保存时将仅更新站点配置', 'warning');
        }
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载首页配置失败：${escapeHtml(err.message)}</div>`;
        return;
    }

    const hero = siteConfig.hero || {};
    const home = siteConfig.home || {};
    if (!Array.isArray(home.galleryPhotos)) home.galleryPhotos = [];
    if (!Array.isArray(home.toolboxDock)) home.toolboxDock = [];

    let saving = false;

    const saveAll = async () => {
        if (saving) return;
        saving = true;
        const btns = [ctx.getTopbarAction('home-top-save'), container.querySelector('#home-bottom-save')].filter(Boolean);
        btns.forEach((b) => { b.disabled = true; b.textContent = '保存中…'; });

        try {
            const patch = {
                hero: {
                    title: container.querySelector('#hero-title').value.trim(),
                    subtitle: container.querySelector('#hero-subtitle').value.trim(),
                    sideNote: container.querySelector('#hero-sidenote').value.trim(),
                    badge: container.querySelector('#hero-badge').value.trim(),
                    scrollLabel: container.querySelector('#hero-scroll').value.trim()
                },
                home: {
                    articlesTitle: container.querySelector('#home-articles-title').value.trim(),
                    articlesMoreText: container.querySelector('#home-articles-more').value.trim(),
                    lifeTitle: container.querySelector('#home-life-title').value.trim(),
                    toolboxTitle: container.querySelector('#home-toolbox-title').value.trim(),
                    toolboxMoreText: container.querySelector('#home-toolbox-more').value.trim(),
                    galleryPhotos: home.galleryPhotos.map((p) => ({
                        id: p.id || uid('photo'),
                        url: (p.url || '').trim(),
                        caption: (p.caption || '').trim(),
                        alt: (p.alt || p.caption || '').trim()
                    })).filter((p) => p.url),
                    toolboxDock: home.toolboxDock.map((d) => ({
                        id: d.id || uid('dock'),
                        label: (d.label || '').trim(),
                        href: (d.href || '').trim() || '#',
                        icon: d.icon || 'link'
                    })).filter((d) => d.label)
                }
            };

            const res = await api.patchSiteConfig(patch);
            siteConfig = cloneDeep(res?.config || { ...siteConfig, ...patch });
            home.galleryPhotos = siteConfig.home.galleryPhotos;
            home.toolboxDock = siteConfig.home.toolboxDock;

            // 同步 Ghost 主题自定义设置 hero_title（侧边竖排语录）、hero_badge、gallery_title
            let themeSyncFailed = false;
            if (Array.isArray(themeSettings) && themeSettings.length > 0) {
                let changed = false;
                const updatedTheme = themeSettings.map((item) => {
                    if (item.key === 'hero_title' && item.value !== siteConfig.hero.sideNote) {
                        changed = true;
                        return { ...item, value: siteConfig.hero.sideNote };
                    }
                    if (item.key === 'hero_badge' && item.value !== siteConfig.hero.badge) {
                        changed = true;
                        return { ...item, value: siteConfig.hero.badge };
                    }
                    if (item.key === 'gallery_title' && item.value !== siteConfig.home.lifeTitle) {
                        changed = true;
                        return { ...item, value: siteConfig.home.lifeTitle };
                    }
                    return item;
                });
                if (changed) {
                    try {
                        themeSettings = await api.saveCustomThemeSettings(updatedTheme);
                    } catch {
                        themeSyncFailed = true;
                    }
                }
            }

            if (themeSyncFailed) {
                toast('首页站点配置已保存，但同步 Ghost 主题设置失败', 'warning');
            } else {
                toast('首页装修配置已保存，刷新博客首页即可看到更新', 'success');
            }
        } catch (err) {
            toast(`保存失败：${err.message}`, 'error');
        } finally {
            saving = false;
            btns.forEach((b) => { b.disabled = false; b.textContent = '保存首页设置'; });
        }
    };

    const renderGallery = () => {
        const grid = container.querySelector('#home-gallery-grid');
        if (!grid) return;
        if (home.galleryPhotos.length === 0) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>暂无轮播照片，点击右上角「添加照片」上传或从图库选择</p></div>`;
            return;
        }
        grid.innerHTML = home.galleryPhotos.map((p, idx) => `
            <div class="photo-card" data-idx="${idx}">
                <div class="photo-card-preview">
                    ${p.url ? `<img src="${escapeAttr(p.url)}" alt="${escapeAttr(p.caption || '')}">` : `<span>未选择图片</span>`}
                </div>
                <div class="photo-card-body">
                    <div class="field">
                        <label>照片标题 / 说明</label>
                        <input type="text" data-field="caption" value="${escapeAttr(p.caption || '')}" placeholder="例如：海边的清晨">
                    </div>
                    <div class="field">
                        <label>图片地址</label>
                        <input type="text" data-field="url" value="${escapeAttr(p.url || '')}" placeholder="/content/images/...">
                    </div>
                    <div class="toolbar-group" style="gap:6px;">
                        <label class="btn btn-xs" style="cursor:pointer;">
                            上传替换
                            <input type="file" accept="image/*" class="hidden" data-action="upload">
                        </label>
                        <button type="button" class="btn btn-xs" data-action="pick">图库选图</button>
                    </div>
                </div>
                <div class="photo-card-footer">
                    <div class="toolbar-group" style="gap:4px;">
                        <button type="button" class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''} title="向前移动">←</button>
                        <button type="button" class="icon-btn" data-action="down" ${idx === home.galleryPhotos.length - 1 ? 'disabled' : ''} title="向后移动">→</button>
                    </div>
                    <button type="button" class="btn btn-danger-soft btn-xs" data-action="remove">删除</button>
                </div>
            </div>
        `).join('');

        grid.querySelectorAll('.photo-card').forEach((card) => {
            const idx = Number(card.dataset.idx);
            const item = home.galleryPhotos[idx];
            if (!item) return;

            card.querySelector('[data-field="caption"]').addEventListener('input', (e) => {
                item.caption = e.target.value;
                item.alt = e.target.value;
            });
            card.querySelector('[data-field="url"]').addEventListener('change', (e) => {
                item.url = e.target.value.trim();
                renderGallery();
            });
            card.querySelector('[data-action="upload"]').addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                    toast('正在上传照片…', 'info', 2000);
                    const up = await api.uploadImage(file);
                    item.url = up.url;
                    if (!item.caption) item.caption = file.name.replace(/\.[^.]+$/, '');
                    item.alt = item.caption;
                    renderGallery();
                    toast('照片上传成功，记得点击保存', 'success');
                } catch (err) {
                    toast(`上传失败：${err.message}`, 'error');
                }
            });
            card.querySelector('[data-action="pick"]').addEventListener('click', () => {
                openMediaPicker({
                    title: '选择首页生活轮播照片',
                    onSelect(url) {
                        item.url = url;
                        renderGallery();
                    }
                });
            });
            card.querySelector('[data-action="up"]').addEventListener('click', () => {
                if (moveItem(home.galleryPhotos, idx, -1)) renderGallery();
            });
            card.querySelector('[data-action="down"]').addEventListener('click', () => {
                if (moveItem(home.galleryPhotos, idx, 1)) renderGallery();
            });
            card.querySelector('[data-action="remove"]').addEventListener('click', () => {
                home.galleryPhotos.splice(idx, 1);
                renderGallery();
            });
        });
    };

    const renderDock = () => {
        const list = container.querySelector('#home-dock-list');
        if (!list) return;
        if (home.toolboxDock.length === 0) {
            list.innerHTML = `<div class="empty-state" style="padding:24px;"><p>暂无快捷入口，点击右上角「新增入口」添加</p></div>`;
            return;
        }
        list.innerHTML = home.toolboxDock.map((d, idx) => `
            <div class="repeater-row repeater-dock" data-idx="${idx}">
                <select data-field="icon">
                    ${DOCK_ICONS.map((opt) => `<option value="${opt.value}" ${d.icon === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}
                </select>
                <input type="text" data-field="label" value="${escapeAttr(d.label || '')}" placeholder="按钮显示文案，如：Shell 小脚本">
                <input type="text" data-field="href" value="${escapeAttr(d.href || '')}" placeholder="跳转链接，如：/toolbox/?tag=shell">
                <div class="toolbar-group" style="gap:4px;">
                    <button type="button" class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''} title="上移">↑</button>
                    <button type="button" class="icon-btn" data-action="down" ${idx === home.toolboxDock.length - 1 ? 'disabled' : ''} title="下移">↓</button>
                    <button type="button" class="btn btn-danger-soft btn-xs" data-action="remove">删除</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.repeater-row').forEach((row) => {
            const idx = Number(row.dataset.idx);
            const item = home.toolboxDock[idx];
            if (!item) return;

            row.querySelector('[data-field="icon"]').addEventListener('change', (e) => { item.icon = e.target.value; });
            row.querySelector('[data-field="label"]').addEventListener('input', (e) => { item.label = e.target.value; });
            row.querySelector('[data-field="href"]').addEventListener('input', (e) => { item.href = e.target.value; });
            row.querySelector('[data-action="up"]').addEventListener('click', () => {
                if (moveItem(home.toolboxDock, idx, -1)) renderDock();
            });
            row.querySelector('[data-action="down"]').addEventListener('click', () => {
                if (moveItem(home.toolboxDock, idx, 1)) renderDock();
            });
            row.querySelector('[data-action="remove"]').addEventListener('click', () => {
                home.toolboxDock.splice(idx, 1);
                renderDock();
            });
        });
    };

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">1. 首屏 Hero 文案</h3>
                    <p class="card-desc">控制首页最上方全屏欢迎区的主标题、副标题、侧边竖排语录与下滑提示（保存时自动同步 Ghost 主题设置）</p>
                </div>
            </div>
            <div class="card-body">
                <div class="form-grid">
                    <div class="field">
                        <label for="hero-title">首屏主标题</label>
                        <input type="text" id="hero-title" value="${escapeAttr(hero.title || '')}" placeholder="Serendipity">
                        <p class="field-hint">显示在首页中央的大号标题</p>
                    </div>
                    <div class="field">
                        <label for="hero-subtitle">首屏副标题</label>
                        <input type="text" id="hero-subtitle" value="${escapeAttr(hero.subtitle || '')}" placeholder="Always curious, always creating">
                        <p class="field-hint">主标题下方的简介或英文 Slogan</p>
                    </div>
                    <div class="field">
                        <label for="hero-sidenote">侧边竖排语录</label>
                        <input type="text" id="hero-sidenote" value="${escapeAttr(hero.sideNote || '')}" placeholder="在雾里看代码，也在雾里看风景">
                        <p class="field-hint">显示在首页「文章」区块左侧的竖排装饰语录</p>
                    </div>
                    <div class="field">
                        <label for="hero-badge">无障碍读屏标识文案</label>
                        <input type="text" id="hero-badge" value="${escapeAttr(hero.badge || '')}" placeholder="Serendipity · 二次元手记">
                        <p class="field-hint">无障碍读屏标识文案（用于辅助阅读与语义描述）</p>
                    </div>
                    <div class="field">
                        <label for="hero-scroll">底部下滑提示文案</label>
                        <input type="text" id="hero-scroll" value="${escapeAttr(hero.scrollLabel || '')}" placeholder="下滑阅读文章">
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">2. 首页各区块标题</h3>
                    <p class="card-desc">自定义首页「文章」「生活」「工具箱」三大板块的栏目名称与「查看更多」按钮文案</p>
                </div>
            </div>
            <div class="card-body">
                <div class="form-grid">
                    <div class="field">
                        <label for="home-articles-title">文章区标题</label>
                        <input type="text" id="home-articles-title" value="${escapeAttr(home.articlesTitle || '')}" placeholder="文章">
                    </div>
                    <div class="field">
                        <label for="home-articles-more">文章区「更多」按钮文案</label>
                        <input type="text" id="home-articles-more" value="${escapeAttr(home.articlesMoreText || '')}" placeholder="全部文章">
                    </div>
                    <div class="field">
                        <label for="home-life-title">生活照片区标题</label>
                        <input type="text" id="home-life-title" value="${escapeAttr(home.lifeTitle || '')}" placeholder="生活">
                    </div>
                    <div class="field">
                        <label for="home-toolbox-title">工具箱区标题</label>
                        <input type="text" id="home-toolbox-title" value="${escapeAttr(home.toolboxTitle || '')}" placeholder="工具箱">
                    </div>
                    <div class="field">
                        <label for="home-toolbox-more">工具箱区「更多」按钮文案</label>
                        <input type="text" id="home-toolbox-more" value="${escapeAttr(home.toolboxMoreText || '')}" placeholder="工具箱">
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">3. 首页生活照片轮播墙</h3>
                    <p class="card-desc">展示在首页「生活」区域的横向轮播照片卡片，支持自定义配文与排序</p>
                </div>
                <div class="toolbar-group">
                    <button type="button" class="btn btn-sm" id="home-add-photo-pick">+ 从图库添加照片</button>
                    <label class="btn btn-primary btn-sm" style="cursor:pointer;">
                        + 上传新照片
                        <input type="file" id="home-add-photo-upload" accept="image/*" class="hidden">
                    </label>
                </div>
            </div>
            <div class="card-body">
                <div id="home-gallery-grid" class="photo-cards-grid"></div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">4. 首页工具箱快捷入口</h3>
                    <p class="card-desc">展示在首页底部工具箱 Dock 栏的快捷按钮，可链接到工具箱标签筛选或任意站内外路径</p>
                </div>
                <button type="button" class="btn btn-sm" id="home-add-dock">+ 新增快捷入口</button>
            </div>
            <div class="card-body">
                <div id="home-dock-list" class="repeater-list"></div>
            </div>
            <div class="card-footer">
                <span class="field-hint">修改完成后请点击保存，所有改动会立即同步到首页</span>
                <button type="button" class="btn btn-primary" id="home-bottom-save">保存首页设置</button>
            </div>
        </div>
    `;

    renderGallery();
    renderDock();

    container.querySelector('#home-add-photo-pick').addEventListener('click', () => {
        openMediaPicker({
            title: '选择照片添加到首页轮播墙',
            onSelect(url, meta) {
                const caption = (meta?.name || '生活记录').replace(/\.[^.]+$/, '');
                home.galleryPhotos.push({ id: uid('photo'), url, caption, alt: caption });
                renderGallery();
            }
        });
    });

    container.querySelector('#home-add-photo-upload').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            toast('正在上传照片…', 'info', 2000);
            const up = await api.uploadImage(file);
            const caption = file.name.replace(/\.[^.]+$/, '');
            home.galleryPhotos.push({ id: uid('photo'), url: up.url, caption, alt: caption });
            renderGallery();
            toast('已添加至照片墙，点击「保存首页设置」生效', 'success');
        } catch (err) {
            toast(`上传失败：${err.message}`, 'error');
        }
    });

    container.querySelector('#home-add-dock').addEventListener('click', () => {
        home.toolboxDock.push({ id: uid('dock'), label: '新快捷入口', href: '/toolbox/', icon: 'sparkles' });
        renderDock();
    });

    ctx.getTopbarAction('home-top-save')?.addEventListener('click', saveAll);
    container.querySelector('#home-bottom-save')?.addEventListener('click', saveAll);
}
