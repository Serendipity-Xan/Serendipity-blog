import { api } from '../api.js';
import { openMediaPicker } from '../components/media-picker.js';
import {
    escapeHtml,
    escapeAttr,
    uid,
    moveItem,
    cloneDeep,
    isImageUrl,
    openModal,
    closeModal,
    confirmModal,
    toast
} from '../utils.js';

function renderFriendIcon(icon, name) {
    if (isImageUrl(icon)) {
        return `<img src="${escapeAttr(icon)}" alt="${escapeAttr(name || '')}">`;
    }
    const text = (icon || (name ? name.slice(0, 1) : '✦')).trim();
    return escapeHtml(text.slice(0, 2));
}

function isValidHttpUrl(raw) {
    const str = String(raw || '').trim();
    if (!str || /\s/.test(str)) return false;
    try {
        const parsed = new URL(str);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
    } catch {
        return false;
    }
}

export async function renderLinksView(container, ctx) {
    ctx.setTopbar('友链管理', '管理 /links/ 星月图谱中的所有友情链接与星座分类', `
        <a href="/links/" target="_blank" rel="noopener" class="btn btn-sm">查看友链星图 ↗</a>
        <button type="button" class="btn btn-primary btn-sm" id="links-top-save">保存友链设置</button>
    `);

    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载友链数据…</span></div>`;

    let siteConfig = null;
    try {
        siteConfig = cloneDeep(await api.getSiteConfig());
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载友链配置失败：${escapeHtml(err.message)}</div>`;
        return;
    }

    const links = siteConfig.links || { hudTitle: '友链', hudSub: '', friends: [] };
    if (!Array.isArray(links.friends)) links.friends = [];
    let saving = false;

    const saveLinks = async (silent = false) => {
        if (saving) return;
        saving = true;
        const topBtn = ctx.getTopbarAction('links-top-save');
        const botBtn = container.querySelector('#links-bottom-save');
        [topBtn, botBtn].filter(Boolean).forEach((b) => { b.disabled = true; b.textContent = '保存中…'; });

        try {
            const patch = {
                links: {
                    hudTitle: container.querySelector('#links-hud-title').value.trim() || '友链',
                    hudSub: container.querySelector('#links-hud-sub').value.trim(),
                    friends: links.friends
                }
            };
            const res = await api.patchSiteConfig(patch);
            siteConfig = cloneDeep(res?.config || { ...siteConfig, ...patch });
            links.friends = siteConfig.links.friends;
            if (!silent) toast('友链配置已保存，刷新 /links/ 立即生效', 'success');
        } catch (err) {
            toast(`保存失败：${err.message}`, 'error');
        } finally {
            saving = false;
            [topBtn, botBtn].filter(Boolean).forEach((b) => { b.disabled = false; b.textContent = '保存友链设置'; });
        }
    };

    const openFriendModal = (existingIndex = -1) => {
        const isEdit = existingIndex >= 0;
        const item = isEdit
            ? cloneDeep(links.friends[existingIndex])
            : { id: uid('friend'), name: '', url: 'https://', desc: '', tags: [], cluster: '', icon: '' };

        const existingClusters = [...new Set(links.friends.map((f) => f.cluster).filter(Boolean))];

        openModal({
            title: isEdit ? `编辑友链：${item.name}` : '添加新友链',
            bodyHtml: `
                <form id="friend-modal-form" class="form-grid">
                    <div class="field">
                        <label for="fm-name">网站名称 *</label>
                        <input type="text" id="fm-name" required value="${escapeAttr(item.name)}" placeholder="例如：白的小站">
                    </div>
                    <div class="field">
                        <label for="fm-url">网站地址 *</label>
                        <input type="url" id="fm-url" required value="${escapeAttr(item.url)}" placeholder="https://example.com/">
                    </div>
                    <div class="field col-span-2">
                        <label for="fm-desc">一句话简介</label>
                        <input type="text" id="fm-desc" value="${escapeAttr(item.desc || '')}" placeholder="例如：毛玻璃风格的二次元博客">
                    </div>
                    <div class="field">
                        <label for="fm-cluster">所属星座分组（主分类）</label>
                        <input type="text" id="fm-cluster" list="fm-cluster-list" value="${escapeAttr(item.cluster || '')}" placeholder="例如：个人博客 / 前端开发">
                        <datalist id="fm-cluster-list">
                            ${existingClusters.map((c) => `<option value="${escapeAttr(c)}"></option>`).join('')}
                        </datalist>
                        <p class="field-hint">决定该友链归属哪颗发光星团</p>
                    </div>
                    <div class="field">
                        <label for="fm-tags">标签（用中文或英文逗号分隔）</label>
                        <input type="text" id="fm-tags" value="${escapeAttr((item.tags || []).join(', '))}" placeholder="个人博客, 前端开发">
                    </div>
                    <div class="field col-span-2">
                        <label for="fm-icon">站点图标（支持 Emoji、单字、图片 URL 或上传头像）</label>
                        <div style="display:flex;gap:10px;align-items:center;">
                            <div id="fm-icon-preview" class="friend-icon-preview">${renderFriendIcon(item.icon, item.name)}</div>
                            <input type="text" id="fm-icon" style="flex:1;" value="${escapeAttr(item.icon || '')}" placeholder="输入 ✦ / M / https://... 或留空自动取首字">
                        </div>
                        <div class="toolbar-group" style="margin-top:6px;">
                            <label class="btn btn-xs" style="cursor:pointer;">
                                上传图标
                                <input type="file" id="fm-icon-upload" accept="image/*" class="hidden">
                            </label>
                            <button type="button" class="btn btn-xs" id="fm-icon-pick">从图库选择</button>
                            <button type="button" class="btn btn-ghost btn-xs" id="fm-icon-clear">清空</button>
                        </div>
                    </div>
                </form>
            `,
            footerHtml: `
                <button type="button" class="btn" data-modal-close>取消</button>
                <button type="button" class="btn btn-primary" id="fm-save-btn">${isEdit ? '更新友链' : '确认添加'}</button>
            `,
            onMount(dialog) {
                const iconInput = dialog.querySelector('#fm-icon');
                const nameInput = dialog.querySelector('#fm-name');
                const preview = dialog.querySelector('#fm-icon-preview');
                const refreshPreview = () => {
                    preview.innerHTML = renderFriendIcon(iconInput.value, nameInput.value);
                };

                iconInput.addEventListener('input', refreshPreview);
                nameInput.addEventListener('input', refreshPreview);

                dialog.querySelector('#fm-icon-upload').addEventListener('change', async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                        toast('正在上传图标…', 'info', 2000);
                        const up = await api.uploadImage(file);
                        iconInput.value = up.url;
                        refreshPreview();
                        toast('图标上传成功', 'success');
                    } catch (err) {
                        toast(`上传失败：${err.message}`, 'error');
                    }
                });

                dialog.querySelector('#fm-icon-pick').addEventListener('click', () => {
                    openMediaPicker({
                        title: '选择友链站点图标',
                        onSelect(url) {
                            iconInput.value = url;
                            refreshPreview();
                        }
                    });
                });

                dialog.querySelector('#fm-icon-clear').addEventListener('click', () => {
                    iconInput.value = '';
                    refreshPreview();
                });

                const handleSave = async () => {
                    const name = nameInput.value.trim();
                    const urlInput = dialog.querySelector('#fm-url');
                    const url = urlInput.value.trim();
                    if (!name) {
                        toast('请填写网站名称', 'warning');
                        nameInput.focus();
                        return;
                    }
                    if (!isValidHttpUrl(url)) {
                        toast('请填写有效的网站地址（需以 http:// 或 https:// 开头且包含有效域名）', 'warning');
                        urlInput.focus();
                        return;
                    }
                    const cluster = dialog.querySelector('#fm-cluster').value.trim();
                    const tagsRaw = dialog.querySelector('#fm-tags').value
                        .split(/[,，]/)
                        .map((s) => s.trim())
                        .filter(Boolean);
                    const tags = tagsRaw.length ? tagsRaw : (cluster ? [cluster] : []);

                    const nextItem = {
                        id: item.id || uid('friend'),
                        name,
                        url,
                        desc: dialog.querySelector('#fm-desc').value.trim(),
                        cluster: cluster || tags[0] || '友情链接',
                        tags,
                        icon: iconInput.value.trim()
                    };

                    if (isEdit) links.friends[existingIndex] = nextItem;
                    else links.friends.push(nextItem);

                    closeModal();
                    renderTable();
                    await saveLinks(false);
                };

                dialog.querySelector('#friend-modal-form').addEventListener('submit', (e) => {
                    e.preventDefault();
                    handleSave();
                });
                dialog.querySelector('#fm-save-btn').addEventListener('click', handleSave);
            }
        });
    };

    const renderTable = () => {
        const countEl = container.querySelector('#links-count-title');
        if (countEl) countEl.textContent = `友链列表（共 ${links.friends.length} 位伙伴）`;
        const wrap = container.querySelector('#links-table-wrap');
        if (!wrap) return;
        if (links.friends.length === 0) {
            wrap.innerHTML = `<div class="empty-state"><p>还没有添加任何友链，点击「添加友链」点亮第一颗星吧</p></div>`;
            return;
        }
        wrap.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>站点</th>
                        <th>星座分组与标签</th>
                        <th>简介</th>
                        <th style="text-align:right;">排序与操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${links.friends.map((f, idx) => `
                        <tr data-idx="${idx}">
                            <td>
                                <div style="display:flex;align-items:center;gap:10px;">
                                    <div class="friend-icon-preview">${renderFriendIcon(f.icon, f.name)}</div>
                                    <div>
                                        <div style="font-weight:600;">${escapeHtml(f.name)}</div>
                                        <a href="${escapeAttr(f.url)}" target="_blank" rel="noopener" class="item-sub">${escapeHtml(f.url)}</a>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div class="toolbar-group" style="gap:4px;">
                                    ${f.cluster ? `<span class="pill pill-primary">${escapeHtml(f.cluster)}</span>` : ''}
                                    ${(f.tags || []).filter((t) => t !== f.cluster).map((t) => `<span class="pill pill-muted">${escapeHtml(t)}</span>`).join('')}
                                </div>
                            </td>
                            <td style="color:var(--ink-secondary);max-width:260px;">${escapeHtml(f.desc || '—')}</td>
                            <td>
                                <div class="row-actions">
                                    <button type="button" class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''} title="上移">↑</button>
                                    <button type="button" class="icon-btn" data-action="down" ${idx === links.friends.length - 1 ? 'disabled' : ''} title="下移">↓</button>
                                    <button type="button" class="btn btn-sm" data-action="edit">编辑</button>
                                    <button type="button" class="btn btn-danger-soft btn-xs" data-action="remove">删除</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        wrap.querySelectorAll('tr[data-idx]').forEach((row) => {
            const idx = Number(row.dataset.idx);
            row.querySelector('[data-action="up"]').addEventListener('click', () => {
                if (moveItem(links.friends, idx, -1)) renderTable();
            });
            row.querySelector('[data-action="down"]').addEventListener('click', () => {
                if (moveItem(links.friends, idx, 1)) renderTable();
            });
            row.querySelector('[data-action="edit"]').addEventListener('click', () => openFriendModal(idx));
            row.querySelector('[data-action="remove"]').addEventListener('click', async () => {
                const target = links.friends[idx];
                const ok = await confirmModal({
                    title: '移除友链',
                    message: `确定要从星月图谱中删除友链「${target.name}」吗？`,
                    confirmText: '确认移除',
                    danger: true
                });
                if (!ok) return;
                links.friends.splice(idx, 1);
                renderTable();
                await saveLinks(false);
            });
        });
    };

    container.innerHTML = `
        <div class="hint-banner">
            <span><strong>底部说明联动：</strong>星月图谱上方标题和所有友链卡片在这里管理；图谱下方的「交换友链格式与申请说明」来自 Ghost 的 <code>links</code> 独立页面。</span>
            <button type="button" class="btn btn-sm" id="links-edit-page-btn">编辑底部「交换友链」说明 →</button>
        </div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">星月图谱标题设置</h3>
                    <p class="card-desc">显示在 /links/ 星月图谱左上角的 HUD 标题与引导副标题</p>
                </div>
            </div>
            <div class="card-body">
                <div class="form-grid">
                    <div class="field">
                        <label for="links-hud-title">图谱标题</label>
                        <input type="text" id="links-hud-title" value="${escapeAttr(links.hudTitle || '')}" placeholder="友链">
                    </div>
                    <div class="field">
                        <label for="links-hud-sub">图谱副标题提示</label>
                        <input type="text" id="links-hud-sub" value="${escapeAttr(links.hudSub || '')}" placeholder="星月图谱：中心明月串联友链…">
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title" id="links-count-title">友链列表（共 ${links.friends.length} 位伙伴）</h3>
                    <p class="card-desc">新增、修改或删除友链会自动保存；调整上下顺序后请点击保存按钮</p>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="links-add-btn">+ 添加友链</button>
            </div>
            <div id="links-table-wrap" class="table-wrap"></div>
            <div class="card-footer">
                <span class="field-hint">调整标题或友链排序后请点击右侧按钮保存</span>
                <button type="button" class="btn btn-primary" id="links-bottom-save">保存友链设置</button>
            </div>
        </div>
    `;

    renderTable();

    container.querySelector('#links-add-btn').addEventListener('click', () => openFriendModal(-1));
    ctx.getTopbarAction('links-top-save')?.addEventListener('click', () => saveLinks(false));
    container.querySelector('#links-bottom-save').addEventListener('click', () => saveLinks(false));

    container.querySelector('#links-edit-page-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            const pages = await api.listPages();
            const linksPage = pages.find((p) => p.slug === 'links');
            if (linksPage) {
                ctx.navigate(`pages/edit/${linksPage.id}`);
            } else {
                toast('未找到路径为 links 的独立页面，已为你跳转至页面管理', 'warning');
                ctx.navigate('pages');
            }
        } catch (err) {
            toast(`读取独立页面失败：${err.message}`, 'error');
            btn.disabled = false;
        }
    });
}
