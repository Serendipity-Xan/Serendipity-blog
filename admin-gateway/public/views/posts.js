import { api } from '../api.js';
import { escapeHtml, escapeAttr, formatDate, confirmModal, toast } from '../utils.js';

export async function renderPostsView(container, ctx, options = {}) {
    ctx.setTopbar('文章管理', '管理全部博客文章、工具箱条目与生活手记', `
        <a class="btn btn-sm" href="#tags">管理标签</a>
        <button type="button" class="btn btn-primary btn-sm" id="posts-new-btn">+ 写新文章</button>
    `);
    ctx.getTopbarAction('posts-new-btn')?.addEventListener('click', () => ctx.navigate('posts/new'));

    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载文章列表…</span></div>`;

    let posts = [];
    let tags = [];
    let toolboxSlug = 'toolbox';
    let lifeSlugs = ['travel', 'life', 'music', 'food', 'photography', 'anime'];

    const filters = {
        keyword: '',
        status: options.status || 'all', // all | published | draft | scheduled
        quickTab: options.quickTab || 'all', // all | toolbox | life
        tagSlug: options.tagSlug || ''
    };

    try {
        const [loadedPosts, loadedTags, siteCfg] = await Promise.all([
            api.listPosts(),
            api.listTags(),
            api.getSiteConfig().catch(() => null)
        ]);
        posts = loadedPosts;
        tags = loadedTags;
        if (siteCfg?.toolbox?.tagSlug) toolboxSlug = siteCfg.toolbox.tagSlug.trim() || 'toolbox';
        if (Array.isArray(siteCfg?.life?.tagSlugs)) {
            lifeSlugs = siteCfg.life.tagSlugs;
        }
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载文章列表失败：${escapeHtml(err.message)}</div>`;
        return;
    }

    const renderList = () => {
        const q = filters.keyword.trim().toLowerCase();
        const filtered = posts.filter((p) => {
            if (filters.status === 'published' && p.status !== 'published') return false;
            if (filters.status === 'draft' && p.status !== 'draft') return false;
            if (filters.status === 'scheduled' && p.status !== 'scheduled') return false;

            const pSlugs = (p.tags || []).map((t) => t.slug);
            if (filters.quickTab === 'toolbox' && !pSlugs.includes(toolboxSlug)) return false;
            if (filters.quickTab === 'life' && !pSlugs.some((s) => lifeSlugs.includes(s))) return false;
            if (filters.tagSlug && !pSlugs.includes(filters.tagSlug)) return false;

            if (q) {
                const hay = `${p.title || ''} ${p.slug || ''} ${p.custom_excerpt || ''} ${(p.tags || []).map((t) => t.name).join(' ')}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        const tbodyWrap = container.querySelector('#posts-table-wrap');
        const countEl = container.querySelector('#posts-count-hint');
        if (countEl) countEl.textContent = `共 ${filtered.length} 篇（全部 ${posts.length} 篇）`;

        if (filtered.length === 0) {
            tbodyWrap.innerHTML = `
                <div class="empty-state">
                    <p>当前筛选条件下没有文章</p>
                    <button type="button" class="btn btn-primary btn-sm" id="posts-empty-new">写一篇新文章</button>
                </div>
            `;
            tbodyWrap.querySelector('#posts-empty-new')?.addEventListener('click', () => ctx.navigate('posts/new'));
            return;
        }

        tbodyWrap.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>文章</th>
                        <th>状态</th>
                        <th>标签</th>
                        <th>发布 / 更新时间</th>
                        <th style="text-align:right;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map((p) => {
                        const isPub = p.status === 'published';
                        const isScheduled = p.status === 'scheduled';
                        const statusPillClass = isPub ? 'pill-success' : isScheduled ? 'pill-primary' : 'pill-warning';
                        const statusPillText = isPub ? '已发布' : isScheduled ? '定时发布' : '草稿';
                        return `
                            <tr data-id="${escapeAttr(p.id)}">
                                <td>
                                    <div class="post-row-title">
                                        ${p.feature_image
                                            ? `<img class="post-thumb" src="${escapeAttr(p.feature_image)}" alt="">`
                                            : `<span class="post-thumb-empty">无图</span>`}
                                        <div>
                                            <a class="item-title-link" href="#posts/edit/${escapeAttr(p.id)}">
                                                ${p.featured ? '<span title="精选文章" style="color:var(--warning);margin-right:4px;">★</span>' : ''}
                                                ${escapeHtml(p.title)}
                                            </a>
                                            <div class="item-sub">/${escapeHtml(p.slug)}/</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span class="pill ${statusPillClass}">${statusPillText}</span>
                                </td>
                                <td>
                                    <div class="toolbar-group" style="gap:4px;">
                                        ${(p.tags || []).length
                                            ? p.tags.map((t) => `<span class="pill ${t.slug === toolboxSlug ? 'pill-primary' : 'pill-muted'}">${escapeHtml(t.name)}</span>`).join('')
                                            : '<span class="item-sub">—</span>'}
                                    </div>
                                </td>
                                <td style="white-space:nowrap;font-size:12.5px;color:var(--muted);">
                                    ${formatDate(p.published_at || p.updated_at)}
                                </td>
                                <td>
                                    <div class="row-actions">
                                        <button type="button" class="btn btn-ghost btn-xs" data-action="toggle-status">
                                            ${isPub ? '转为草稿' : '立即发布'}
                                        </button>
                                        ${isPub && p.url ? `<a href="${escapeAttr(p.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-xs">预览 ↗</a>` : ''}
                                        <a href="#posts/edit/${escapeAttr(p.id)}" class="btn btn-sm">编辑</a>
                                        <button type="button" class="btn btn-danger-soft btn-xs" data-action="delete">删除</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        tbodyWrap.querySelectorAll('tr[data-id]').forEach((row) => {
            const id = row.dataset.id;
            const post = posts.find((p) => p.id === id);
            if (!post) return;

            row.querySelector('[data-action="toggle-status"]')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                const nextStatus = post.status === 'published' ? 'draft' : 'published';
                btn.disabled = true;
                try {
                    const updated = await api.updatePost(post.id, {
                        status: nextStatus,
                        updated_at: post.updated_at
                    });
                    if (updated) {
                        const idx = posts.findIndex((x) => x.id === post.id);
                        if (idx !== -1) posts[idx] = { ...posts[idx], ...updated };
                    }
                    toast(nextStatus === 'published' ? '文章已发布' : '文章已转为草稿', 'success');
                    renderList();
                } catch (err) {
                    toast(`状态切换失败：${err.message}`, 'error');
                    btn.disabled = false;
                }
            });

            row.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
                const ok = await confirmModal({
                    title: '删除文章',
                    message: `确定要永久删除文章《${post.title}》吗？删除后无法恢复。`,
                    confirmText: '确认删除',
                    danger: true
                });
                if (!ok) return;
                try {
                    await api.deletePost(post.id);
                    posts = posts.filter((x) => x.id !== post.id);
                    toast('文章已删除', 'success');
                    renderList();
                } catch (err) {
                    toast(`删除失败：${err.message}`, 'error');
                }
            });
        });
    };

    container.innerHTML = `
        <div class="card">
            <div class="card-body" style="padding-bottom:14px;">
                <div class="toolbar-bar" style="margin-bottom:12px;">
                    <div class="tabs" id="posts-quick-tabs">
                        <button type="button" class="tab-btn ${filters.quickTab === 'all' ? 'active' : ''}" data-qtab="all">全部文章</button>
                        <button type="button" class="tab-btn ${filters.quickTab === 'toolbox' ? 'active' : ''}" data-qtab="toolbox">工具箱文章</button>
                        <button type="button" class="tab-btn ${filters.quickTab === 'life' ? 'active' : ''}" data-qtab="life">生活文章</button>
                    </div>
                    <span id="posts-count-hint" class="field-hint"></span>
                </div>

                <div class="toolbar-bar" style="margin-bottom:0;">
                    <div class="toolbar-group">
                        <input type="search" id="posts-search" class="search-input" placeholder="搜索标题、路径或标签…" value="${escapeAttr(filters.keyword)}">
                        <select id="posts-status-filter" style="width:130px;">
                            <option value="all" ${filters.status === 'all' ? 'selected' : ''}>全部状态</option>
                            <option value="published" ${filters.status === 'published' ? 'selected' : ''}>仅已发布</option>
                            <option value="draft" ${filters.status === 'draft' ? 'selected' : ''}>仅草稿</option>
                            <option value="scheduled" ${filters.status === 'scheduled' ? 'selected' : ''}>仅定时发布</option>
                        </select>
                        <select id="posts-tag-filter" style="width:165px;">
                            <option value="">按标签筛选（全部）</option>
                            ${tags.map((t) => `<option value="${escapeAttr(t.slug)}" ${filters.tagSlug === t.slug ? 'selected' : ''}>${escapeHtml(t.name)} (${t.count?.posts ?? 0})</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
            <div id="posts-table-wrap" class="table-wrap"></div>
        </div>
    `;

    container.querySelector('#posts-quick-tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-qtab]');
        if (!btn) return;
        filters.quickTab = btn.dataset.qtab;
        filters.tagSlug = '';
        const tagFilterEl = container.querySelector('#posts-tag-filter');
        if (tagFilterEl) tagFilterEl.value = '';
        container.querySelectorAll('#posts-quick-tabs .tab-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.qtab === filters.quickTab);
        });
        renderList();
    });

    container.querySelector('#posts-search').addEventListener('input', (e) => {
        filters.keyword = e.target.value;
        renderList();
    });
    container.querySelector('#posts-status-filter').addEventListener('change', (e) => {
        filters.status = e.target.value;
        renderList();
    });
    container.querySelector('#posts-tag-filter').addEventListener('change', (e) => {
        filters.tagSlug = e.target.value;
        renderList();
    });

    renderList();
}
