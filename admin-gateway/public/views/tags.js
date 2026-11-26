import { api } from '../api.js';
import { confirmModal, escapeAttr, escapeHtml, toast } from '../utils.js';

export async function renderTagsView(container, ctx) {
    ctx.setTopbar('文章标签', '新建和删除博客文章的分类标签');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>正在加载文章标签…</span></div>';

    let tags;
    try {
        tags = await api.listTags();
    } catch (error) {
        container.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
        return;
    }

    container.innerHTML = `
        <section class="card">
            <div class="card-header"><h3 class="card-title">新建文章标签</h3></div>
            <div class="card-body">
                <form class="field" data-tag-create>
                    <label for="new-tag-name">标签名称</label>
                    <div class="input-with-actions">
                        <input id="new-tag-name" name="name" type="text" maxlength="191" required>
                        <button type="submit" class="btn btn-primary">新建标签</button>
                    </div>
                </form>
            </div>
        </section>
        <section class="card">
            <div class="card-header">
                <div><h3 class="card-title">现有文章标签</h3><p class="card-desc" data-tag-count></p></div>
            </div>
            <div class="card-body" data-tag-list></div>
        </section>
    `;

    const form = container.querySelector('[data-tag-create]');
    const nameField = form.elements.namedItem('name');
    const createButton = form.querySelector('button');
    const list = container.querySelector('[data-tag-list]');
    let busy = false;

    function renderList() {
        container.querySelector('[data-tag-count]').textContent = `共 ${tags.length} 个`;
        if (!tags.length) {
            list.innerHTML = '<div class="empty-state"><p>暂无文章标签</p></div>';
            return;
        }
        list.innerHTML = `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>标签</th><th>路径</th><th>文章数</th><th>操作</th></tr></thead>
                    <tbody>
                        ${tags.map(tag => `
                            <tr>
                                <td>${escapeHtml(tag.name)}</td>
                                <td><code>${escapeHtml(tag.slug)}</code></td>
                                <td>${Number(tag.count?.posts) || 0}</td>
                                <td><button type="button" class="btn btn-danger-soft btn-xs" data-delete-tag="${escapeAttr(tag.id)}" aria-label="删除 ${escapeAttr(tag.name)}">删除</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        const name = nameField.value.trim();
        if (!name) {
            toast('请输入标签名称', 'warning');
            return;
        }
        busy = true;
        createButton.disabled = true;
        try {
            const tag = await api.createTag({ name });
            if (!tag) throw new Error('未收到新标签');
            tags = [...tags.filter(item => item.id !== tag.id), tag];
            form.reset();
            renderList();
            toast(`已新建标签「${tag.name}」`, 'success');
        } catch (error) {
            toast(`新建标签失败：${error.message}`, 'error');
        } finally {
            createButton.disabled = false;
            busy = false;
        }
    });

    list.addEventListener('click', async event => {
        const button = event.target.closest('[data-delete-tag]');
        if (!button || busy) return;
        const tag = tags.find(item => item.id === button.dataset.deleteTag);
        if (!tag) return;
        busy = true;
        try {
            const approved = await confirmModal({
                title: '删除文章标签',
                message: `删除「${tag.name}」后，相关文章会移除这个标签，文章仍会保留。`,
                confirmText: '删除标签',
                danger: true
            });
            if (!approved) return;
            button.disabled = true;
            await api.deleteTag(tag.id);
            tags = tags.filter(item => item.id !== tag.id);
            renderList();
            try {
                const config = await api.getSiteConfig();
                const selected = config.life?.tagSlugs;
                if (Array.isArray(selected) && selected.includes(tag.slug)) {
                    await api.patchSiteConfig({ life: { tagSlugs: selected.filter(slug => slug !== tag.slug) } });
                }
                toast(`已删除标签「${tag.name}」`, 'success');
            } catch (error) {
                toast(`标签已删除，生活栏目的筛选规则同步失败：${error.message}`, 'warning');
            }
        } catch (error) {
            toast(`删除标签失败：${error.message}`, 'error');
        } finally {
            button.disabled = false;
            busy = false;
        }
    });

    renderList();
}
