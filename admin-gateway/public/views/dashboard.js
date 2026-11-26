import { api } from '../api.js';
import { escapeHtml, escapeAttr, formatDate } from '../utils.js';

export async function renderDashboardView(container, ctx) {
    ctx.setTopbar('工作台概览', '快速掌握站点内容、互动与页面配置状态', `
        <button type="button" class="btn btn-primary btn-sm" id="dash-top-new-post">+ 写新文章</button>
    `);
    ctx.getTopbarAction('dash-top-new-post')?.addEventListener('click', () => ctx.navigate('posts/new'));

    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在汇总站点数据…</span></div>`;

    try {
        const [posts, pages, tags, siteConfig, mediaData] = await Promise.all([
            api.listPosts(),
            api.listPages(),
            api.listTags(),
            api.getSiteConfig(),
            api.getMedia()
        ]);

        const publishedCount = posts.filter((p) => p.status === 'published').length;
        const draftCount = posts.filter((p) => p.status === 'draft').length;
        const scheduledCount = posts.filter((p) => p.status === 'scheduled').length;
        const friendsCount = (siteConfig?.links?.friends || []).length;
        const photosCount = (siteConfig?.home?.galleryPhotos || []).length;
        const mediaCount = (mediaData?.images || []).length;
        const recentPosts = posts.slice(0, 6);

        const stats = [
            { label: '已发布文章', value: publishedCount, sub: '公开展示在博客中', route: 'posts', options: { status: 'published' } },
            { label: '草稿箱', value: draftCount, sub: scheduledCount > 0 ? `另有 ${scheduledCount} 篇定时发布` : '尚未公开发布', route: 'posts', options: { status: 'draft' } },
            ...(scheduledCount > 0 ? [{ label: '定时发布', value: scheduledCount, sub: '待到达发布时间', route: 'posts', options: { status: 'scheduled' } }] : []),
            { label: '独立页面', value: pages.length, sub: '关于、友链、专题页等', route: 'pages' },
            { label: '内容标签', value: tags.length, sub: '文章分类与栏目归属', route: 'settings', options: { tab: 'profile' } },
            { label: '星月友链', value: friendsCount, sub: '展示在 /links/ 星图', route: 'links' },
            { label: '首页生活照片', value: photosCount, sub: '展示在首页照片轮播墙', route: 'home' },
            { label: '媒体图库', value: mediaCount, sub: '/content/images/ 图片总数', route: 'media' }
        ];

        container.innerHTML = `
            <div class="stats-grid">
                ${stats.map((s) => `
                    <div class="stat-card" data-nav="${escapeAttr(s.route)}" ${s.options ? `data-nav-options="${escapeAttr(JSON.stringify(s.options))}"` : ''}>
                        <span class="stat-label">${escapeHtml(s.label)}</span>
                        <span class="stat-value">${s.value}</span>
                        <span class="stat-sub">${escapeHtml(s.sub)}</span>
                    </div>
                `).join('')}
            </div>

            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">快捷操作</h3>
                        <p class="card-desc">日常写作与装修最高频的入口</p>
                    </div>
                </div>
                <div class="card-body">
                    <div class="quick-actions">
                        <button type="button" class="btn btn-primary" data-nav="posts/new">✎ 写新文章</button>
                        <button type="button" class="btn" data-nav="links">✦ 添加友链</button>
                        <button type="button" class="btn" data-nav="home">⌂ 首页装修</button>
                        <button type="button" class="btn" data-nav="appearance">◐ 外观与壁纸库</button>
                        <button type="button" class="btn" data-nav="media">▣ 上传图片到图库</button>
                        <a href="/" target="_blank" rel="noopener" class="btn">查看博客前台 ↗</a>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">最近更新的文章</h3>
                        <p class="card-desc">按最近修改时间排序，点击可直接进入编辑</p>
                    </div>
                    <button type="button" class="btn btn-sm" data-nav="posts">管理全部文章 →</button>
                </div>
                <div class="table-wrap">
                    ${recentPosts.length === 0 ? `
                        <div class="empty-state">
                            <p>还没有任何文章，开始写第一篇吧。</p>
                            <button type="button" class="btn btn-primary btn-sm" data-nav="posts/new">写新文章</button>
                        </div>
                    ` : `
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>文章标题</th>
                                    <th>状态</th>
                                    <th>标签</th>
                                    <th>更新时间</th>
                                    <th style="text-align:right;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recentPosts.map((p) => `
                                    <tr>
                                        <td>
                                            <div class="post-row-title">
                                                ${p.feature_image
                                                    ? `<img class="post-thumb" src="${escapeAttr(p.feature_image)}" alt="">`
                                                    : `<span class="post-thumb-empty">无图</span>`}
                                                <div>
                                                    <a class="item-title-link" href="#posts/edit/${escapeAttr(p.id)}">${escapeHtml(p.title)}</a>
                                                    <div class="item-sub">/${escapeHtml(p.slug)}/${p.featured ? ' · ★ 精选' : ''}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span class="pill ${p.status === 'published' ? 'pill-success' : p.status === 'scheduled' ? 'pill-primary' : 'pill-warning'}">
                                                ${p.status === 'published' ? '已发布' : p.status === 'scheduled' ? '定时发布' : '草稿'}
                                            </span>
                                        </td>
                                        <td>
                                            <div class="toolbar-group" style="gap:4px;">
                                                ${(p.tags || []).length
                                                    ? p.tags.map((t) => `<span class="pill pill-muted">${escapeHtml(t.name)}</span>`).join('')
                                                    : '<span class="item-sub">无标签</span>'}
                                            </div>
                                        </td>
                                        <td style="white-space:nowrap;color:var(--muted);font-size:12.5px;">${formatDate(p.updated_at)}</td>
                                        <td>
                                            <div class="row-actions">
                                                ${p.status === 'published' && p.url ? `<a href="${escapeAttr(p.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-xs">查看 ↗</a>` : ''}
                                                <a href="#posts/edit/${escapeAttr(p.id)}" class="btn btn-sm">编辑</a>
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

        container.querySelectorAll('[data-nav]').forEach((el) => {
            el.addEventListener('click', () => {
                let navOptions = null;
                if (el.dataset.navOptions) {
                    try { navOptions = JSON.parse(el.dataset.navOptions); } catch {}
                }
                ctx.navigate(el.dataset.nav, navOptions);
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载工作台数据失败：${escapeHtml(err.message)}</div>`;
    }
}
