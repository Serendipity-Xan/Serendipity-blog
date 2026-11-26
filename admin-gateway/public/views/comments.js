import { api } from '../api.js';
import { escapeHtml, escapeAttr, formatDate, confirmModal, toast } from '../utils.js';

const COMMENT_STATUS_META = {
    published: { label: '已显示', cls: 'pill-success' },
    hidden: { label: '已隐藏', cls: 'pill-warning' },
    deleted: { label: '已删除', cls: 'pill-danger' }
};

function stripHtmlToExcerpt(html, maxLen = 140) {
    if (!html) return '（空评论）';
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html);
    const text = (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
    if (!text) return '（空评论）';
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

export async function renderCommentsView(container, ctx) {
    ctx.setTopbar('评论管理', '审核文章评论或控制全站评论开关', '');
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载评论设置与列表…</span></div>`;

    let commentsEnabled = 'off';
    let comments = [];
    let meta = { pagination: { page: 1, pages: 1, total: 0 } };
    let currentPage = 1;
    const pageLimit = 30;

    try {
        const [settingsList, commentsRes] = await Promise.all([
            api.getSettings(),
            api.listComments(1, pageLimit)
        ]);
        const found = (settingsList || []).find((s) => s.key === 'comments_enabled');
        if (found?.value) commentsEnabled = found.value;
        comments = commentsRes?.comments || [];
        meta = commentsRes?.meta || meta;
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载评论管理失败：${escapeHtml(err.message)}</div>`;
        return;
    }

    const loadCommentsPage = async (page = 1) => {
        currentPage = page;
        const wrap = container.querySelector('#cm-table-wrap');
        if (wrap) {
            wrap.innerHTML = `<div class="loading-state" style="padding:32px;"><div class="spinner"></div><span>正在加载评论列表…</span></div>`;
        }
        try {
            const res = await api.listComments(page, pageLimit);
            comments = res?.comments || [];
            meta = res?.meta || { pagination: { page, pages: 1, total: comments.length } };
            renderTable();
        } catch (err) {
            if (wrap) {
                wrap.innerHTML = `<div class="card-body"><div class="form-error">加载评论列表失败：${escapeHtml(err.message)}</div></div>`;
            } else {
                toast(`加载评论失败：${err.message}`, 'error');
            }
        }
    };

    const renderTable = () => {
        const wrap = container.querySelector('#cm-table-wrap');
        const footer = container.querySelector('#cm-pagination-footer');
        const countEl = container.querySelector('#cm-count-hint');
        if (!wrap) return;

        const pagination = meta?.pagination || { page: currentPage, pages: 1, total: comments.length };
        const total = pagination.total ?? comments.length;
        if (countEl) countEl.textContent = `共 ${total} 条评论`;

        if (comments.length === 0) {
            wrap.innerHTML = `
                <div class="empty-state">
                    <p>暂无文章评论记录</p>
                    <span class="field-hint">开启上方全站评论权限并在前台启用评论组件后，读者评论将汇总显示在此处</span>
                </div>
            `;
        } else {
            wrap.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>评论者</th>
                            <th>所属文章</th>
                            <th>评论内容</th>
                            <th>状态</th>
                            <th>评论时间</th>
                            <th style="text-align:right;">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${comments.map((c) => {
                            const member = c.member || {};
                            const post = c.post || {};
                            const st = COMMENT_STATUS_META[c.status] || { label: c.status || '未知', cls: 'pill-muted' };
                            const excerpt = stripHtmlToExcerpt(c.html);
                            const isPublished = c.status === 'published';
                            const isDeleted = c.status === 'deleted';
                            return `
                                <tr data-comment-id="${escapeAttr(c.id)}">
                                    <td>
                                        <div style="font-weight:600;color:var(--ink);">${escapeHtml(member.name || '匿名会员')}</div>
                                        <div class="item-sub">${escapeHtml(member.email || '—')}</div>
                                    </td>
                                    <td style="max-width:220px;">
                                        ${post.title ? `
                                            ${post.url
                                                ? `<a href="${escapeAttr(post.url)}" target="_blank" rel="noopener" class="item-title-link">${escapeHtml(post.title)} ↗</a>`
                                                : `<span style="font-weight:500;">${escapeHtml(post.title)}</span>`}
                                        ` : '<span class="item-sub">未关联文章</span>'}
                                    </td>
                                    <td style="max-width:320px;color:var(--ink-secondary);line-height:1.5;">
                                        ${escapeHtml(excerpt)}
                                    </td>
                                    <td><span class="pill ${st.cls}">${escapeHtml(st.label)}</span></td>
                                    <td style="white-space:nowrap;font-size:12.5px;color:var(--muted);">
                                        ${formatDate(c.created_at)}
                                    </td>
                                    <td>
                                        <div class="row-actions">
                                            ${!isDeleted ? `
                                                <button type="button" class="btn btn-sm" data-action="toggle-visibility" data-next="${isPublished ? 'hidden' : 'published'}">
                                                    ${isPublished ? '隐藏' : '恢复显示'}
                                                </button>
                                                <button type="button" class="btn btn-danger-soft btn-xs" data-action="delete">删除</button>
                                            ` : `
                                                <button type="button" class="btn btn-ghost btn-xs" data-action="restore">恢复显示</button>
                                            `}
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;

            wrap.querySelectorAll('tr[data-comment-id]').forEach((row) => {
                const id = row.dataset.commentId;
                const comment = comments.find((x) => x.id === id);
                if (!comment) return;

                const updateStatus = async (nextStatus, btn) => {
                    if (btn) btn.disabled = true;
                    try {
                        const updated = await api.updateCommentStatus(comment.id, nextStatus);
                        const idx = comments.findIndex((x) => x.id === comment.id);
                        if (idx !== -1) {
                            comments[idx] = updated ? { ...comments[idx], ...updated } : { ...comments[idx], status: nextStatus };
                        }
                        const labelMap = {
                            published: '评论已恢复显示',
                            hidden: '评论已隐藏',
                            deleted: '评论已标记删除'
                        };
                        toast(labelMap[nextStatus] || '评论状态已更新', 'success');
                        renderTable();
                    } catch (err) {
                        toast(`更新评论状态失败：${err.message}`, 'error');
                        if (btn) btn.disabled = false;
                    }
                };

                row.querySelector('[data-action="toggle-visibility"]')?.addEventListener('click', (e) => {
                    const btn = e.currentTarget;
                    updateStatus(btn.dataset.next, btn);
                });

                row.querySelector('[data-action="restore"]')?.addEventListener('click', (e) => {
                    updateStatus('published', e.currentTarget);
                });

                row.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
                    const btn = e.currentTarget;
                    const ok = await confirmModal({
                        title: '删除评论',
                        message: '确定将该评论标记为已删除吗？',
                        confirmText: '确认删除',
                        danger: true
                    });
                    if (!ok) return;
                    await updateStatus('deleted', btn);
                });
            });
        }

        if (footer) {
            const pages = Number(pagination.pages || 1);
            const curr = Number(pagination.page || currentPage || 1);
            if (pages > 1) {
                footer.classList.remove('hidden');
                footer.innerHTML = `
                    <span class="field-hint">第 ${curr} / ${pages} 页（共 ${total} 条）</span>
                    <div class="toolbar-group">
                        <button type="button" class="btn btn-sm" id="cm-prev-page" ${curr <= 1 ? 'disabled' : ''}>上一页</button>
                        <button type="button" class="btn btn-sm" id="cm-next-page" ${curr >= pages ? 'disabled' : ''}>下一页</button>
                    </div>
                `;
                footer.querySelector('#cm-prev-page')?.addEventListener('click', () => loadCommentsPage(curr - 1));
                footer.querySelector('#cm-next-page')?.addEventListener('click', () => loadCommentsPage(curr + 1));
            } else {
                footer.classList.add('hidden');
                footer.innerHTML = '';
            }
        }
    };

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">全站评论权限开关</h3>
                    <p class="card-desc">控制全站 Ghost 原生评论功能的开放范围，保存后立即同步至 Ghost 设置</p>
                </div>
                <div class="toolbar-group">
                    <select id="cm-enabled-select" style="width:210px;">
                        <option value="all" ${commentsEnabled === 'all' ? 'selected' : ''}>全部会员可评（all）</option>
                        <option value="paid" ${commentsEnabled === 'paid' ? 'selected' : ''}>仅付费会员可评（paid）</option>
                        <option value="off" ${commentsEnabled === 'off' ? 'selected' : ''}>关闭评论（off）</option>
                    </select>
                    <button type="button" class="btn btn-primary btn-sm" id="cm-save-setting">保存评论设置</button>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">评论审核列表</h3>
                    <p class="card-desc">支持隐藏、恢复显示或删除读者发布的评论</p>
                </div>
                <span id="cm-count-hint" class="field-hint"></span>
            </div>
            <div id="cm-table-wrap" class="table-wrap"></div>
            <div id="cm-pagination-footer" class="card-footer hidden"></div>
        </div>
    `;

    container.querySelector('#cm-save-setting')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const value = container.querySelector('#cm-enabled-select').value;
        btn.disabled = true;
        btn.textContent = '保存中…';
        try {
            await api.saveSettings([{ key: 'comments_enabled', value }]);
            commentsEnabled = value;
            toast('全站评论权限已保存', 'success');
        } catch (err) {
            toast(`保存评论设置失败：${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '保存评论设置';
        }
    });

    renderTable();
}
