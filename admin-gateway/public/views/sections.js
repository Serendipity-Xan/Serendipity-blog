import { api } from '../api.js';
import { escapeHtml, escapeAttr, cloneDeep, toast } from '../utils.js';

export async function renderSectionsView(container, ctx) {
    ctx.setTopbar('栏目与展示规则', '控制「生活」「工具箱」「文章归档」三个前台专题页的文案与筛选规则', `
        <button type="button" class="btn btn-primary btn-sm" id="sec-top-save">保存栏目规则</button>
    `);

    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载栏目配置与标签列表…</span></div>`;

    let siteConfig = null;
    let allTags = [];

    try {
        const [cfg, tags] = await Promise.all([api.getSiteConfig(), api.listTags()]);
        siteConfig = cloneDeep(cfg);
        allTags = tags || [];
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载栏目配置失败：${escapeHtml(err.message)}</div>`;
        return;
    }

    const life = siteConfig.life || {};
    const toolbox = siteConfig.toolbox || {};
    const articles = siteConfig.articles || {};

    const selectedLifeSlugs = new Set(Array.isArray(life.tagSlugs) ? life.tagSlugs : []);
    // 把已配置但 Ghost 暂未创建的 slug 也展示出来，避免静默丢失
    const knownSlugs = new Set(allTags.map((t) => t.slug));
    const extraLifeSlugs = [...selectedLifeSlugs].filter((s) => !knownSlugs.has(s));

    let saving = false;
    const saveAll = async () => {
        if (saving) return;
        saving = true;
        const btns = [ctx.getTopbarAction('sec-top-save'), container.querySelector('#sec-bottom-save')].filter(Boolean);
        btns.forEach((b) => { b.disabled = true; b.textContent = '保存中…'; });

        try {
            const pageSize = Math.max(1, Math.min(50, Number(container.querySelector('#life-page-size').value) || 9));
            const tbSlug = container.querySelector('#tb-tag-slug').value.trim() || 'toolbox';

            const patch = {
                life: {
                    kicker: container.querySelector('#life-kicker').value.trim(),
                    title: container.querySelector('#life-title').value.trim(),
                    subtitle: container.querySelector('#life-subtitle').value.trim(),
                    listHeading: container.querySelector('#life-list-heading').value.trim(),
                    tagSlugs: [...selectedLifeSlugs],
                    pageSize
                },
                toolbox: {
                    tagSlug: tbSlug,
                    allButtonText: container.querySelector('#tb-all-btn').value.trim(),
                    listHeading: container.querySelector('#tb-list-heading').value.trim(),
                    emptyText: container.querySelector('#tb-empty-text').value.trim()
                },
                articles: {
                    title: container.querySelector('#art-title').value.trim(),
                    allButtonText: container.querySelector('#art-all-btn').value.trim(),
                    archiveHeading: container.querySelector('#art-heading').value.trim()
                }
            };

            const res = await api.patchSiteConfig(patch);
            siteConfig = cloneDeep(res?.config || { ...siteConfig, ...patch });
            toast('栏目与展示规则已保存，前台页面立即生效', 'success');
        } catch (err) {
            toast(`保存失败：${err.message}`, 'error');
        } finally {
            saving = false;
            btns.forEach((b) => { b.disabled = false; b.textContent = '保存栏目规则'; });
        }
    };

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">生活栏目（/life/）</h3>
                    <p class="card-desc">控制「生活栏目」页面的标题文案、纳入展示的标签范围以及分页数量</p>
                </div>
                <a href="/life/" target="_blank" rel="noopener" class="btn btn-sm">查看 /life/ ↗</a>
            </div>
            <div class="card-body">
                <div class="form-grid">
                    <div class="field">
                        <label for="life-kicker">顶部眉标（Kicker）</label>
                        <input type="text" id="life-kicker" value="${escapeAttr(life.kicker || '')}" placeholder="生活手记">
                    </div>
                    <div class="field">
                        <label for="life-title">页面主标题</label>
                        <input type="text" id="life-title" value="${escapeAttr(life.title || '')}" placeholder="生活手记">
                    </div>
                    <div class="field col-span-2">
                        <label for="life-subtitle">页面副标题</label>
                        <input type="text" id="life-subtitle" value="${escapeAttr(life.subtitle || '')}" placeholder="关于旅行、静日、美食与音乐的小小记录。">
                    </div>
                    <div class="field">
                        <label for="life-list-heading">文章列表区标题</label>
                        <input type="text" id="life-list-heading" value="${escapeAttr(life.listHeading || '')}" placeholder="最近的生活记录">
                    </div>
                    <div class="field">
                        <label for="life-page-size">每页展示文章篇数（1 - 50）</label>
                        <input type="number" id="life-page-size" min="1" max="50" value="${escapeAttr(life.pageSize ?? 9)}">
                        <p class="field-hint">超出该数量时，前台会自动显示上一页 / 下一页分页器</p>
                    </div>
                    <div class="field col-span-2">
                        <div class="toolbar-group">
                            <strong>勾选纳入「生活栏目」的文章标签</strong>
                            <a class="btn btn-sm" href="#tags">管理标签</a>
                        </div>
                        <div class="tag-checkbox-grid" id="life-tags-grid">
                            ${allTags.map((t) => `
                                <label class="tag-checkbox-pill">
                                    <input type="checkbox" value="${escapeAttr(t.slug)}" ${selectedLifeSlugs.has(t.slug) ? 'checked' : ''}>
                                    <span>${escapeHtml(t.name)} <small style="opacity:0.65;">(${escapeHtml(t.slug)})</small></span>
                                </label>
                            `).join('')}
                            ${extraLifeSlugs.map((slug) => `
                                <label class="tag-checkbox-pill">
                                    <input type="checkbox" value="${escapeAttr(slug)}" checked>
                                    <span>${escapeHtml(slug)} <small style="opacity:0.65;">(预设)</small></span>
                                </label>
                            `).join('')}
                        </div>
                        <p class="field-hint">带有以上任意一个标签的已发布文章，都会自动出现在 /life/ 栏目中</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">工具箱栏目（/toolbox/）</h3>
                    <p class="card-desc">控制工具箱星环页面关联的文章标签、按钮文案与空状态提示</p>
                </div>
                <div class="toolbar-group">
                    <button type="button" class="btn btn-sm" id="sec-goto-tb-posts">筛选查看工具箱文章 →</button>
                    <a href="/toolbox/" target="_blank" rel="noopener" class="btn btn-sm">查看 /toolbox/ ↗</a>
                </div>
            </div>
            <div class="card-body">
                <div class="form-grid">
                    <div class="field">
                        <label for="tb-tag-slug">关联标签路径（Slug）</label>
                        <div class="input-with-actions">
                            <input type="text" id="tb-tag-slug" value="${escapeAttr(toolbox.tagSlug || 'toolbox')}" placeholder="toolbox">
                            <select id="tb-tag-quick" style="width:170px;">
                                <option value="">从现有标签选择…</option>
                                ${allTags.map((t) => `<option value="${escapeAttr(t.slug)}" ${t.slug === toolbox.tagSlug ? 'selected' : ''}>${escapeHtml(t.name)} (${escapeHtml(t.slug)})</option>`).join('')}
                            </select>
                        </div>
                        <p class="field-hint">文章只要带有该标签（默认 <code>toolbox</code>），就会自动进入工具箱星环</p>
                    </div>
                    <div class="field">
                        <label for="tb-all-btn">「全部工具」按钮文案</label>
                        <input type="text" id="tb-all-btn" value="${escapeAttr(toolbox.allButtonText || '')}" placeholder="✦ 全部工具">
                    </div>
                    <div class="field">
                        <label for="tb-list-heading">列表区标题</label>
                        <input type="text" id="tb-list-heading" value="${escapeAttr(toolbox.listHeading || '')}" placeholder="全部工具文章">
                    </div>
                    <div class="field">
                        <label for="tb-empty-text">暂无工具文章时的提示语</label>
                        <input type="text" id="tb-empty-text" value="${escapeAttr(toolbox.emptyText || '')}" placeholder="暂无带有工具箱标签的文章…">
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">文章归档页（/articles/）</h3>
                    <p class="card-desc">控制全站文章星云与时间归档页面的标题和按钮文字</p>
                </div>
                <a href="/articles/" target="_blank" rel="noopener" class="btn btn-sm">查看 /articles/ ↗</a>
            </div>
            <div class="card-body">
                <div class="form-grid-3">
                    <div class="field">
                        <label for="art-title">归档页主标题</label>
                        <input type="text" id="art-title" value="${escapeAttr(articles.title || '')}" placeholder="文章归档">
                    </div>
                    <div class="field">
                        <label for="art-all-btn">全站筛选按钮文案</label>
                        <input type="text" id="art-all-btn" value="${escapeAttr(articles.allButtonText || '')}" placeholder="✦ 全站文章">
                    </div>
                    <div class="field">
                        <label for="art-heading">下方目录标题</label>
                        <input type="text" id="art-heading" value="${escapeAttr(articles.archiveHeading || '')}" placeholder="全站文章">
                    </div>
                </div>
            </div>
            <div class="card-footer">
                <span class="field-hint">保存后会同时更新生活、工具箱、文章归档三个栏目的展示规则</span>
                <button type="button" class="btn btn-primary" id="sec-bottom-save">保存栏目规则</button>
            </div>
        </div>
    `;

    container.querySelectorAll('#life-tags-grid input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', () => {
            if (cb.checked) selectedLifeSlugs.add(cb.value);
            else selectedLifeSlugs.delete(cb.value);
        });
    });

    container.querySelector('#tb-tag-quick').addEventListener('change', (e) => {
        if (e.target.value) {
            container.querySelector('#tb-tag-slug').value = e.target.value;
        }
    });

    container.querySelector('#sec-goto-tb-posts').addEventListener('click', () => {
        ctx.navigate('posts', { quickTab: 'toolbox' });
    });

    ctx.getTopbarAction('sec-top-save')?.addEventListener('click', saveAll);
    container.querySelector('#sec-bottom-save').addEventListener('click', saveAll);
}
