import { api } from '../api.js';
import { escapeHtml, escapeAttr, formatDate, confirmModal, toast } from '../utils.js';

const SYSTEM_TEMPLATE_SLUGS = new Set(['articles', 'life', 'toolbox']);

const PAGE_ROLE_HINTS = {
    about: {
        badge: '正文全量展示',
        pillClass: 'pill-primary',
        desc: '前台 /about/ 页面会完整展示这里的 Markdown 正文与封面图，适合写个人介绍与建站记录。'
    },
    links: {
        badge: '友链页底部说明',
        pillClass: 'pill-primary',
        desc: '星月友链图谱在「友链管理」中维护；本页正文会显示在 /links/ 底部，适合写「交换友链格式与申请说明」。'
    },
    articles: {
        badge: '主题专属模板（栏目规则控制）',
        pillClass: 'pill-muted',
        desc: '前台 /articles/ 的版式与文章列表由「栏目与展示规则」和主题模板自动控制；编辑页仅用于修改页面标题与元信息。'
    },
    life: {
        badge: '主题专属模板（栏目规则控制）',
        pillClass: 'pill-muted',
        desc: '前台 /life/ 的版式与文章筛选由「栏目与展示规则」和主题模板控制；编辑页仅用于修改页面标题与元信息。'
    },
    toolbox: {
        badge: '主题专属模板（栏目规则控制）',
        pillClass: 'pill-muted',
        desc: '前台 /toolbox/ 的星环版式与工具文章由「栏目与展示规则」和主题模板控制；编辑页仅用于修改页面标题与元信息。'
    }
};

export async function renderPagesView(container, ctx) {
    ctx.setTopbar('独立页面', '管理「关于」「友链说明」等独立页面，或创建新的自定义页面', `
        <button type="button" class="btn btn-primary btn-sm" id="pages-new-btn">+ 新建独立页面</button>
    `);
    ctx.getTopbarAction('pages-new-btn')?.addEventListener('click', () => ctx.navigate('pages/new'));

    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载独立页面…</span></div>`;

    let pages = [];
    try {
        pages = await api.listPages();
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载独立页面失败：${escapeHtml(err.message)}</div>`;
        return;
    }

    const render = () => {
        container.innerHTML = `
            <div class="hint-banner">
                <span><strong>提示：</strong><code>about</code> 与自定义页面的正文会在前台完整展示；<code>links</code> 正文用于友链页底部交换说明；<code>articles</code> / <code>life</code> / <code>toolbox</code> 由专属模板渲染。</span>
                <button type="button" class="btn btn-sm" id="pages-goto-sections">去设置栏目展示规则 →</button>
            </div>

            <div class="card">
                <div class="table-wrap">
                    ${pages.length === 0 ? `
                        <div class="empty-state">
                            <p>暂无独立页面</p>
                            <button type="button" class="btn btn-primary btn-sm" id="pages-empty-new">新建页面</button>
                        </div>
                    ` : `
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>页面标题与路径</th>
                                    <th>前台渲染说明</th>
                                    <th>状态</th>
                                    <th>更新时间</th>
                                    <th style="text-align:right;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pages.map((p) => {
                                    const role = PAGE_ROLE_HINTS[p.slug] || {
                                        badge: '自定义独立页',
                                        pillClass: 'pill-success',
                                        desc: '常规独立页面，访问对应路径即可查看这里编写的正文内容。'
                                    };
                                    const isPub = p.status === 'published';
                                    const isScheduled = p.status === 'scheduled';
                                    const isSystemTemplate = SYSTEM_TEMPLATE_SLUGS.has(p.slug);
                                    return `
                                        <tr data-id="${escapeAttr(p.id)}">
                                            <td>
                                                <a class="item-title-link" href="#pages/edit/${escapeAttr(p.id)}">${escapeHtml(p.title)}</a>
                                                <div class="item-sub">/${escapeHtml(p.slug)}/</div>
                                            </td>
                                            <td style="max-width:380px;">
                                                <span class="pill ${role.pillClass}" style="margin-bottom:4px;">${escapeHtml(role.badge)}</span>
                                                <div class="item-sub">${escapeHtml(role.desc)}</div>
                                            </td>
                                            <td>
                                                <span class="pill ${isPub ? 'pill-success' : isScheduled ? 'pill-primary' : 'pill-warning'}">${isPub ? '已发布' : isScheduled ? '定时发布' : '草稿'}</span>
                                            </td>
                                            <td style="white-space:nowrap;color:var(--muted);font-size:12.5px;">${formatDate(p.updated_at)}</td>
                                            <td>
                                                <div class="row-actions">
                                                    ${isPub && p.url ? `<a href="${escapeAttr(p.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-xs">打开 ↗</a>` : ''}
                                                    ${isSystemTemplate
                                                        ? `<button type="button" class="btn btn-primary btn-sm" data-action="goto-sections">去「栏目与展示规则」配置 →</button>
                                                           <a href="#pages/edit/${escapeAttr(p.id)}" class="btn btn-sm" title="该页面的版式与文章列表由「栏目与展示规则」控制，此处仅用于修改标题或元信息">编辑页面标题/元信息</a>`
                                                        : `<a href="#pages/edit/${escapeAttr(p.id)}" class="btn btn-sm">编辑正文</a>`}
                                                    <button type="button" class="btn btn-danger-soft btn-xs" data-action="delete">删除</button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>
        `;

        container.querySelector('#pages-goto-sections')?.addEventListener('click', () => ctx.navigate('sections'));
        container.querySelector('#pages-empty-new')?.addEventListener('click', () => ctx.navigate('pages/new'));

        container.querySelectorAll('tr[data-id]').forEach((row) => {
            const id = row.dataset.id;
            const page = pages.find((x) => x.id === id);
            if (!page) return;
            row.querySelector('[data-action="goto-sections"]')?.addEventListener('click', () => ctx.navigate('sections'));
            row.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
                const isSpecial = Boolean(PAGE_ROLE_HINTS[page.slug]);
                const ok = await confirmModal({
                    title: '删除独立页面',
                    message: isSpecial
                        ? `注意：「/${page.slug}/」是站点预设栏目页，删除可能导致对应前台路由返回 404。确定仍要删除《${page.title}》吗？`
                        : `确定要删除页面《${page.title}》吗？删除后无法恢复。`,
                    confirmText: '确认删除',
                    danger: true
                });
                if (!ok) return;
                try {
                    await api.deletePage(page.id);
                    pages = pages.filter((x) => x.id !== page.id);
                    toast('页面已删除', 'success');
                    render();
                } catch (err) {
                    toast(`删除失败：${err.message}`, 'error');
                }
            });
        });
    };

    render();
}
