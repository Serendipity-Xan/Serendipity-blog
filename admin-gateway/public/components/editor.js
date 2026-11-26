import { api } from '../api.js';
import { markdownToHtml, htmlToMarkdown } from '../markdown.js';
import { openMediaPicker } from './media-picker.js';
import {
    escapeHtml,
    escapeAttr,
    formatDateTimeLocal,
    localDateTimeToIso,
    toast
} from '../utils.js';

export async function renderEditorView(container, ctx, { kind = 'post', id = null, onBack }) {
    const isPost = kind === 'post';
    const labelName = isPost ? '文章' : '独立页面';
    ctx.setTopbar(
        id ? `编辑${labelName}` : `新建${labelName}`,
        isPost ? '支持 Markdown 双栏实时预览、粘贴/拖拽传图' : '支持 Markdown 编写页面正文，保存后即时生效',
        ''
    );

    container.classList.add('editor-mode');
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载编辑器…</span></div>`;

    let doc = null;
    let allTags = [];
    let toolboxSlug = 'toolbox';

    try {
        const [loadedDoc, tags, siteCfg] = await Promise.all([
            id ? (isPost ? api.getPost(id) : api.getPage(id)) : Promise.resolve(null),
            isPost ? api.listTags() : Promise.resolve([]),
            api.getSiteConfig().catch(() => null)
        ]);
        doc = loadedDoc;
        allTags = tags || [];
        if (siteCfg?.toolbox?.tagSlug) {
            toolboxSlug = siteCfg.toolbox.tagSlug.trim() || 'toolbox';
        }
        if (id && !doc) {
            container.innerHTML = `<div class="card"><div class="card-body"><div class="form-error">未找到该${labelName}，可能已被删除。</div><button class="btn" style="margin-top:12px;" id="ed-back-missing">返回列表</button></div></div>`;
            container.querySelector('#ed-back-missing')?.addEventListener('click', () => onBack?.());
            return;
        }
    } catch (err) {
        container.innerHTML = `<div class="card"><div class="card-body"><div class="form-error">加载失败：${escapeHtml(err.message)}</div><button class="btn" style="margin-top:12px;" id="ed-back-err">返回列表</button></div></div>`;
        container.querySelector('#ed-back-err')?.addEventListener('click', () => onBack?.());
        return;
    }

    let initialMd = doc?.html ? htmlToMarkdown(doc.html) : '';
    const EMPTY_LEXICAL = JSON.stringify({
        root: {
            children: [
                {
                    children: [],
                    direction: null,
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1
                }
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1
        }
    });
    const state = {
        id: doc?.id || null,
        updated_at: doc?.updated_at || null,
        url: doc?.url || '',
        title: doc?.title || '',
        slug: doc?.slug || '',
        status: doc?.status || 'draft',
        featured: Boolean(doc?.featured),
        published_at: formatDateTimeLocal(doc?.published_at),
        feature_image: doc?.feature_image || '',
        feature_image_alt: doc?.feature_image_alt || '',
        feature_image_caption: doc?.feature_image_caption || '',
        custom_excerpt: doc?.custom_excerpt || '',
        meta_title: doc?.meta_title || '',
        meta_description: doc?.meta_description || '',
        og_title: doc?.og_title || '',
        og_description: doc?.og_description || '',
        og_image: doc?.og_image || '',
        twitter_title: doc?.twitter_title || '',
        twitter_description: doc?.twitter_description || '',
        twitter_image: doc?.twitter_image || '',
        codeinjection_head: doc?.codeinjection_head || '',
        codeinjection_foot: doc?.codeinjection_foot || '',
        show_title_and_feature_image: doc?.show_title_and_feature_image ?? true,
        markdown: initialMd,
        selectedTagSlugs: new Set((doc?.tags || []).map((t) => t.slug)),
        viewMode: 'split', // edit | split | preview
        saving: false
    };

    const getStatusMeta = (status) => {
        if (status === 'published') return { cls: 'pill-success', text: '已发布' };
        if (status === 'scheduled') return { cls: 'pill-primary', text: '定时发布' };
        return { cls: 'pill-warning', text: '草稿' };
    };

    const renderTagCheckboxes = () => {
        if (!isPost) return '';
        const listEl = container.querySelector('#ed-tags-list');
        if (!listEl) return;
        if (allTags.length === 0) {
            listEl.innerHTML = `<span class="field-hint">暂无标签，可在下方快速新建</span>`;
            return;
        }
        listEl.innerHTML = allTags.map((t) => {
            const checked = state.selectedTagSlugs.has(t.slug) ? 'checked' : '';
            return `
                <label class="tag-checkbox-pill">
                    <input type="checkbox" value="${escapeAttr(t.slug)}" ${checked}>
                    <span>${escapeHtml(t.name)}</span>
                </label>
            `;
        }).join('');

        listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                if (cb.checked) state.selectedTagSlugs.add(cb.value);
                else state.selectedTagSlugs.delete(cb.value);
                syncToolboxCheckbox();
            });
        });
    };

    const syncToolboxCheckbox = () => {
        const tbCb = container.querySelector('#ed-toolbox-toggle');
        if (tbCb) {
            tbCb.checked = state.selectedTagSlugs.has(toolboxSlug);
        }
    };

    const refreshCoverPreview = () => {
        const box = container.querySelector('#ed-cover-preview');
        if (!box) return;
        if (state.feature_image) {
            box.innerHTML = `<img src="${escapeAttr(state.feature_image)}" alt="封面预览">`;
        } else {
            box.innerHTML = `<span>暂无封面图</span>`;
        }
    };

    const refreshTopStatus = () => {
        const statusPill = container.querySelector('#ed-status-pill');
        const previewBtn = container.querySelector('#ed-preview-link');
        const statusMeta = getStatusMeta(state.status);
        if (statusPill) {
            statusPill.className = `pill ${statusMeta.cls}`;
            statusPill.textContent = statusMeta.text;
        }
        if (previewBtn) {
            if (state.status === 'published' && state.url) {
                previewBtn.href = state.url;
                previewBtn.classList.remove('hidden');
            } else {
                previewBtn.classList.add('hidden');
            }
        }
    };

    const initialStatusMeta = getStatusMeta(state.status);

    container.innerHTML = `
        <div class="editor-topbar">
            <div class="toolbar-group">
                <button type="button" class="btn btn-sm" id="ed-back-btn">← 返回${labelName}列表</button>
                <span id="ed-status-pill" class="pill ${initialStatusMeta.cls}">${initialStatusMeta.text}</span>
                <a id="ed-preview-link" class="btn btn-ghost btn-sm ${state.status === 'published' && state.url ? '' : 'hidden'}" href="${escapeAttr(state.url || '#')}" target="_blank" rel="noopener">查看前台页面 ↗</a>
            </div>
            <div class="toolbar-group">
                <button type="button" class="btn btn-sm" id="ed-save-btn">保存修改</button>
                <button type="button" class="btn btn-primary btn-sm" id="ed-publish-btn">${state.status === 'published' ? '保存并更新发布' : '保存并立即发布'}</button>
            </div>
        </div>

        <div class="editor-layout">
            <div class="editor-main-card">
                <input type="text" id="ed-title" class="editor-title-input" placeholder="输入${labelName}标题…" value="${escapeAttr(state.title)}">

                <div class="md-toolbar">
                    <div class="md-toolbar-btns" id="ed-md-toolbar">
                        <button type="button" class="md-tool-btn" data-md="h2" title="二级标题">H2</button>
                        <button type="button" class="md-tool-btn" data-md="h3" title="三级标题">H3</button>
                        <span class="md-sep"></span>
                        <button type="button" class="md-tool-btn" data-md="bold" title="加粗"><b>B</b></button>
                        <button type="button" class="md-tool-btn" data-md="italic" title="斜体"><i>I</i></button>
                        <button type="button" class="md-tool-btn" data-md="strike" title="删除线"><s>S</s></button>
                        <button type="button" class="md-tool-btn" data-md="code" title="行内代码">&lt;/&gt;</button>
                        <button type="button" class="md-tool-btn" data-md="codeblock" title="代码块">代码块</button>
                        <span class="md-sep"></span>
                        <button type="button" class="md-tool-btn" data-md="quote" title="引用">引用</button>
                        <button type="button" class="md-tool-btn" data-md="ul" title="无序列表">• 列表</button>
                        <button type="button" class="md-tool-btn" data-md="ol" title="有序列表">1. 列表</button>
                        <span class="md-sep"></span>
                        <button type="button" class="md-tool-btn" data-md="link" title="插入链接">链接</button>
                        <button type="button" class="md-tool-btn" data-md="upload-img" title="上传本地图片">上传图片</button>
                        <button type="button" class="md-tool-btn" data-md="pick-img" title="从图库插图">图库插图</button>
                        <button type="button" class="md-tool-btn" data-md="table" title="插入表格">表格</button>
                        <button type="button" class="md-tool-btn" data-md="hr" title="分割线">分割线</button>
                    </div>
                    <div class="tabs" id="ed-mode-tabs">
                        <button type="button" class="tab-btn" data-mode="edit">编辑</button>
                        <button type="button" class="tab-btn active" data-mode="split">双栏实时预览</button>
                        <button type="button" class="tab-btn" data-mode="preview">纯预览</button>
                    </div>
                </div>

                <input type="file" id="ed-inline-img-input" accept="image/*" class="hidden">

                <div class="editor-panes mode-split" id="ed-panes">
                    <div class="editor-write-pane" id="ed-write-pane">
                        <textarea id="ed-markdown" class="md-textarea" placeholder="使用 Markdown 书写内容… 支持直接粘贴截图或拖拽图片到此处上传"></textarea>
                    </div>
                    <div class="editor-resizer" id="ed-resizer" role="separator" aria-orientation="vertical" title="拖动调整左右比例（最多 1:9），双击重置"></div>
                    <div class="editor-preview-pane" id="ed-preview-pane">
                        <div id="ed-preview" class="md-preview"></div>
                    </div>
                </div>

                <div class="editor-statusbar">
                    <span>支持直接 Ctrl+V 粘贴剪贴板图片，或将图片拖入编辑区自动上传</span>
                    <span id="ed-word-count">0 字</span>
                </div>
            </div>

            <aside class="editor-side">
                <div class="card">
                    <div class="card-header" style="padding:14px 16px;">
                        <h3 class="card-title" style="font-size:14px;">发布与基础属性</h3>
                    </div>
                    <div class="card-body">
                        <div class="field">
                            <label for="ed-status">发布状态</label>
                            <select id="ed-status">
                                <option value="published" ${state.status === 'published' ? 'selected' : ''}>已发布（前台可见）</option>
                                <option value="draft" ${state.status === 'draft' ? 'selected' : ''}>草稿（仅后台可见）</option>
                                ${state.status === 'scheduled' ? '<option value="scheduled" selected>定时发布</option>' : ''}
                            </select>
                        </div>

                        <div class="field">
                            <label for="ed-slug">访问路径（Slug）</label>
                            <input type="text" id="ed-slug" value="${escapeAttr(state.slug)}" placeholder="留空将根据标题自动生成">
                            <p class="field-hint">决定页面访问地址，例如 /my-post/</p>
                        </div>

                        <div class="field">
                            <label for="ed-published-at">发布时间</label>
                            <input type="datetime-local" id="ed-published-at" value="${escapeAttr(state.published_at)}">
                        </div>

                        ${isPost ? `
                            <label class="check-row">
                                <input type="checkbox" id="ed-featured" ${state.featured ? 'checked' : ''}>
                                <span>设为精选文章（首页与所属标签页优先展示）</span>
                            </label>
                            <label class="check-row">
                                <input type="checkbox" id="ed-toolbox-toggle" ${state.selectedTagSlugs.has(toolboxSlug) ? 'checked' : ''}>
                                <span>加入工具箱（自动关联 <code>${escapeHtml(toolboxSlug)}</code> 标签）</span>
                            </label>
                        ` : ''}
                    </div>
                </div>

                ${isPost ? `
                <div class="card">
                    <div class="card-header" style="padding:14px 16px;">
                        <h3 class="card-title" style="font-size:14px;">文章标签</h3>
                    </div>
                    <div class="card-body">
                        <div id="ed-tags-list" class="tag-checkbox-grid"></div>
                        <div class="input-with-actions" style="margin-top:4px;">
                            <input type="text" id="ed-new-tag-name" placeholder="输入新标签名称…">
                            <button type="button" class="btn btn-sm" id="ed-new-tag-btn">新建</button>
                        </div>
                        <p class="field-hint">标签同时决定文章是否出现在「生活」「工具箱」等专题栏目</p>
                    </div>
                </div>
                ` : ''}

                <div class="card">
                    <div class="card-header" style="padding:14px 16px;">
                        <h3 class="card-title" style="font-size:14px;">封面图与摘要</h3>
                    </div>
                    <div class="card-body">
                        <div id="ed-cover-preview" class="cover-preview-box"></div>
                        <div class="toolbar-group">
                            <label class="btn btn-sm" style="cursor:pointer;">
                                上传封面
                                <input type="file" id="ed-cover-upload" accept="image/*" class="hidden">
                            </label>
                            <button type="button" class="btn btn-sm" id="ed-cover-pick">图库选图</button>
                            <button type="button" class="btn btn-ghost btn-sm" id="ed-cover-clear">清除</button>
                        </div>
                        <div class="field">
                            <label for="ed-cover-url">封面图地址</label>
                            <input type="text" id="ed-cover-url" value="${escapeAttr(state.feature_image)}" placeholder="/content/images/...">
                        </div>
                        <div class="field">
                            <label for="ed-cover-alt">封面图说明（Alt）</label>
                            <input type="text" id="ed-cover-alt" value="${escapeAttr(state.feature_image_alt)}" placeholder="可选，用于无障碍描述">
                        </div>
                        <div class="field">
                            <label for="ed-cover-caption">封面图配文（可选）</label>
                            <input type="text" id="ed-cover-caption" value="${escapeAttr(state.feature_image_caption)}" placeholder="显示在封面图下方的配文说明">
                        </div>
                        <div class="field">
                            <label for="ed-excerpt" style="justify-content:space-between;">
                                <span>文章摘要</span>
                                <span id="ed-excerpt-count" class="field-hint">${state.custom_excerpt.length} / 300</span>
                            </label>
                            <textarea id="ed-excerpt" rows="3" maxlength="300" placeholder="留空将自动截取正文开头展示在列表卡片中">${escapeHtml(state.custom_excerpt)}</textarea>
                        </div>
                    </div>
                </div>

                <details class="card" id="ed-advanced-details">
                    <summary class="card-header" style="padding:14px 16px;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;">
                        <h3 class="card-title" style="font-size:14px;">高级 SEO / 社交卡片 / 代码注入</h3>
                        <span class="field-hint">展开/收起 ▾</span>
                    </summary>
                    <div class="card-body">
                        ${!isPost ? `
                            <label class="check-row">
                                <input type="checkbox" id="ed-show-title-feature" ${state.show_title_and_feature_image ? 'checked' : ''}>
                                <span>显示页面标题与头图</span>
                            </label>
                        ` : ''}

                        <div class="field">
                            <label for="ed-meta-title">SEO 标题</label>
                            <input type="text" id="ed-meta-title" maxlength="300" value="${escapeAttr(state.meta_title)}" placeholder="留空默认使用${labelName}标题">
                        </div>
                        <div class="field">
                            <label for="ed-meta-desc">SEO 描述</label>
                            <textarea id="ed-meta-desc" rows="2" maxlength="500" placeholder="留空默认使用摘要">${escapeHtml(state.meta_description)}</textarea>
                        </div>

                        <div class="field">
                            <label for="ed-og-title">Open Graph 分享标题</label>
                            <input type="text" id="ed-og-title" maxlength="300" value="${escapeAttr(state.og_title)}" placeholder="微信 / Facebook 等分享卡片标题">
                        </div>
                        <div class="field">
                            <label for="ed-og-desc">Open Graph 分享描述</label>
                            <textarea id="ed-og-desc" rows="2" maxlength="500" placeholder="分享卡片描述文案">${escapeHtml(state.og_description)}</textarea>
                        </div>
                        <div class="field">
                            <label for="ed-og-image">Open Graph 分享图片</label>
                            <div class="input-with-actions">
                                <input type="text" id="ed-og-image" value="${escapeAttr(state.og_image)}" placeholder="/content/images/...">
                                <button type="button" class="btn btn-sm" id="ed-og-image-pick">图库</button>
                            </div>
                        </div>

                        <div class="field">
                            <label for="ed-tw-title">X / Twitter 卡片标题</label>
                            <input type="text" id="ed-tw-title" maxlength="300" value="${escapeAttr(state.twitter_title)}" placeholder="X (Twitter) 分享标题">
                        </div>
                        <div class="field">
                            <label for="ed-tw-desc">X / Twitter 卡片描述</label>
                            <textarea id="ed-tw-desc" rows="2" maxlength="500" placeholder="X (Twitter) 分享描述">${escapeHtml(state.twitter_description)}</textarea>
                        </div>
                        <div class="field">
                            <label for="ed-tw-image">X / Twitter 卡片图片</label>
                            <div class="input-with-actions">
                                <input type="text" id="ed-tw-image" value="${escapeAttr(state.twitter_image)}" placeholder="/content/images/...">
                                <button type="button" class="btn btn-sm" id="ed-tw-image-pick">图库</button>
                            </div>
                        </div>

                        <div class="field">
                            <label for="ed-head-inject">页头代码注入（&lt;head&gt;）</label>
                            <textarea id="ed-head-inject" rows="3" style="font-family:var(--font-mono);font-size:12px;" placeholder="<style>...</style> 或自定义 meta">${escapeHtml(state.codeinjection_head)}</textarea>
                        </div>
                        <div class="field">
                            <label for="ed-foot-inject">页脚代码注入（&lt;/body&gt; 前）</label>
                            <textarea id="ed-foot-inject" rows="3" style="font-family:var(--font-mono);font-size:12px;" placeholder="<script>...</script>">${escapeHtml(state.codeinjection_foot)}</textarea>
                        </div>
                    </div>
                </details>
            </aside>
        </div>
    `;

    const textarea = container.querySelector('#ed-markdown');
    const previewEl = container.querySelector('#ed-preview');
    const previewPane = container.querySelector('#ed-preview-pane');
    const wordCountEl = container.querySelector('#ed-word-count');
    const panesEl = container.querySelector('#ed-panes');
    const writePane = container.querySelector('#ed-write-pane');
    const resizerEl = container.querySelector('#ed-resizer');
    const inlineImgInput = container.querySelector('#ed-inline-img-input');

    // 双栏双向同步滚动
    let scrollSyncSource = null;
    let scrollUnlockTimer = null;
    const syncScroll = (fromEl, toEl, sourceName) => {
        if (state.viewMode !== 'split') return;
        if (scrollSyncSource && scrollSyncSource !== sourceName) return;
        const fromMax = fromEl.scrollHeight - fromEl.clientHeight;
        const toMax = toEl.scrollHeight - toEl.clientHeight;
        if (fromMax <= 0 || toMax <= 0) return;
        scrollSyncSource = sourceName;
        const ratio = fromEl.scrollTop / fromMax;
        toEl.scrollTop = ratio * toMax;
        clearTimeout(scrollUnlockTimer);
        scrollUnlockTimer = setTimeout(() => {
            scrollSyncSource = null;
        }, 60);
    };
    textarea.addEventListener('scroll', () => syncScroll(textarea, previewPane, 'editor'));
    previewPane.addEventListener('scroll', () => syncScroll(previewPane, textarea, 'preview'));

    // 分割线拖拽调整左右比例（范围 10% ~ 90%，即最多 1:9）
    const applySplitRatio = (leftPct) => {
        const clamped = Math.min(90, Math.max(10, leftPct));
        panesEl.style.setProperty('--split-left-fr', `${clamped}fr`);
        panesEl.style.setProperty('--split-right-fr', `${100 - clamped}fr`);
    };
    let isDraggingSplit = false;
    resizerEl.addEventListener('pointerdown', (e) => {
        if (state.viewMode !== 'split') return;
        isDraggingSplit = true;
        resizerEl.classList.add('dragging');
        panesEl.classList.add('resizing');
        resizerEl.setPointerCapture(e.pointerId);
        e.preventDefault();
    });
    resizerEl.addEventListener('pointermove', (e) => {
        if (!isDraggingSplit) return;
        const rect = panesEl.getBoundingClientRect();
        if (rect.width <= 0) return;
        const rawPct = ((e.clientX - rect.left) / rect.width) * 100;
        applySplitRatio(rawPct);
    });
    const stopDraggingSplit = (e) => {
        if (!isDraggingSplit) return;
        isDraggingSplit = false;
        resizerEl.classList.remove('dragging');
        panesEl.classList.remove('resizing');
        if (e.pointerId !== undefined && resizerEl.hasPointerCapture?.(e.pointerId)) {
            resizerEl.releasePointerCapture(e.pointerId);
        }
    };
    resizerEl.addEventListener('pointerup', stopDraggingSplit);
    resizerEl.addEventListener('pointercancel', stopDraggingSplit);
    resizerEl.addEventListener('dblclick', () => applySplitRatio(50));

    textarea.value = state.markdown;

    const updatePreview = () => {
        state.markdown = textarea.value;
        const html = markdownToHtml(state.markdown);
        previewEl.innerHTML = html || '<p style="color:var(--muted-light);">在左侧输入 Markdown 内容，此处将实时渲染预览效果…</p>';
        const plainCount = state.markdown.replace(/\s+/g, '').length;
        wordCountEl.textContent = `${plainCount} 字`;
    };

    const insertAtCursor = (before, after = '', placeholder = '') => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.slice(start, end) || placeholder;
        const nextVal = textarea.value.slice(0, start) + before + selected + after + textarea.value.slice(end);
        textarea.value = nextVal;
        const cursorStart = start + before.length;
        const cursorEnd = cursorStart + selected.length;
        textarea.focus();
        textarea.setSelectionRange(cursorStart, cursorEnd);
        updatePreview();
    };

    const uploadAndInsertImage = async (file) => {
        if (!file || !file.type.startsWith('image/')) {
            toast('请选择图片文件', 'warning');
            return;
        }
        toast('正在上传图片…', 'info', 2000);
        try {
            const uploaded = await api.uploadImage(file);
            insertAtCursor(`\n![](${uploaded.url})\n`);
            toast('图片已上传并插入正文', 'success');
        } catch (err) {
            toast(`图片上传失败：${err.message}`, 'error');
        }
    };

    // 初始化渲染
    updatePreview();
    refreshCoverPreview();
    renderTagCheckboxes();

    textarea.addEventListener('input', updatePreview);

    // 粘贴图片直接上传
    textarea.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) uploadAndInsertImage(file);
                return;
            }
        }
    });

    // 拖拽图片上传
    writePane.addEventListener('dragover', (e) => {
        e.preventDefault();
        writePane.classList.add('drag-over');
    });
    writePane.addEventListener('dragleave', () => {
        writePane.classList.remove('drag-over');
    });
    writePane.addEventListener('drop', (e) => {
        e.preventDefault();
        writePane.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/')) {
            uploadAndInsertImage(file);
        }
    });

    // Markdown 工具栏
    container.querySelector('#ed-md-toolbar').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-md]');
        if (!btn) return;
        const cmd = btn.dataset.md;
        switch (cmd) {
            case 'h2': insertAtCursor('\n## ', '\n', '二级标题'); break;
            case 'h3': insertAtCursor('\n### ', '\n', '三级标题'); break;
            case 'bold': insertAtCursor('**', '**', '加粗文字'); break;
            case 'italic': insertAtCursor('*', '*', '斜体文字'); break;
            case 'strike': insertAtCursor('~~', '~~', '删除线文字'); break;
            case 'code': insertAtCursor('`', '`', 'code'); break;
            case 'codeblock': insertAtCursor('\n```js\n', '\n```\n', '// 在这里输入代码'); break;
            case 'quote': insertAtCursor('\n> ', '\n', '引用内容'); break;
            case 'ul': insertAtCursor('\n- ', '\n', '列表项'); break;
            case 'ol': insertAtCursor('\n1. ', '\n', '列表项'); break;
            case 'link': insertAtCursor('[', '](https://example.com)', '链接文字'); break;
            case 'hr': insertAtCursor('\n\n---\n\n'); break;
            case 'table':
                insertAtCursor('\n| 列一 | 列二 | 列三 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n');
                break;
            case 'upload-img':
                inlineImgInput.click();
                break;
            case 'pick-img':
                openMediaPicker({
                    title: '选择要插入正文的图片',
                    onSelect(url, meta) {
                        const alt = (meta?.name || '配图').replace(/\.[^.]+$/, '');
                        insertAtCursor(`\n![${alt}](${url})\n`);
                    }
                });
                break;
        }
    });

    inlineImgInput.addEventListener('change', () => {
        const file = inlineImgInput.files?.[0];
        inlineImgInput.value = '';
        if (file) uploadAndInsertImage(file);
    });

    // 视图模式切换
    container.querySelector('#ed-mode-tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mode]');
        if (!btn) return;
        const mode = btn.dataset.mode;
        state.viewMode = mode;
        panesEl.className = `editor-panes mode-${mode}`;
        container.querySelectorAll('#ed-mode-tabs .tab-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
    });

    // 元数据绑定
    container.querySelector('#ed-title').addEventListener('input', (e) => { state.title = e.target.value; });
    container.querySelector('#ed-slug').addEventListener('input', (e) => { state.slug = e.target.value.trim(); });
    container.querySelector('#ed-status').addEventListener('change', (e) => {
        state.status = e.target.value;
        refreshTopStatus();
    });
    container.querySelector('#ed-published-at').addEventListener('change', (e) => {
        state.published_at = e.target.value;
    });
    container.querySelector('#ed-featured')?.addEventListener('change', (e) => {
        state.featured = e.target.checked;
    });
    container.querySelector('#ed-toolbox-toggle')?.addEventListener('change', (e) => {
        if (e.target.checked) state.selectedTagSlugs.add(toolboxSlug);
        else state.selectedTagSlugs.delete(toolboxSlug);
        renderTagCheckboxes();
    });

    // 快速新建标签
    container.querySelector('#ed-new-tag-name')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            container.querySelector('#ed-new-tag-btn')?.click();
        }
    });
    container.querySelector('#ed-new-tag-btn')?.addEventListener('click', async () => {
        const input = container.querySelector('#ed-new-tag-name');
        const name = input.value.trim();
        if (!name) {
            toast('请先输入标签名称', 'warning');
            return;
        }
        if (name.startsWith(',')) {
            toast('标签名称不能以英文逗号开头', 'warning');
            return;
        }
        try {
            const created = await api.createTag({ name });
            if (created) {
                allTags.push(created);
                state.selectedTagSlugs.add(created.slug);
                input.value = '';
                renderTagCheckboxes();
                syncToolboxCheckbox();
                toast(`已新建标签「${created.name}」`, 'success');
            }
        } catch (err) {
            toast(`新建标签失败：${err.message}`, 'error');
        }
    });

    // 封面图处理
    const coverUrlInput = container.querySelector('#ed-cover-url');
    const excerptCountEl = container.querySelector('#ed-excerpt-count');
    coverUrlInput.addEventListener('input', (e) => {
        state.feature_image = e.target.value.trim();
        refreshCoverPreview();
    });
    container.querySelector('#ed-cover-alt').addEventListener('input', (e) => {
        state.feature_image_alt = e.target.value;
    });
    container.querySelector('#ed-cover-caption').addEventListener('input', (e) => {
        state.feature_image_caption = e.target.value;
    });
    container.querySelector('#ed-excerpt').addEventListener('input', (e) => {
        state.custom_excerpt = e.target.value;
        if (excerptCountEl) {
            excerptCountEl.textContent = `${state.custom_excerpt.length} / 300`;
        }
    });

    // 高级 SEO / 社交卡片 / 代码注入绑定
    container.querySelector('#ed-show-title-feature')?.addEventListener('change', (e) => {
        state.show_title_and_feature_image = e.target.checked;
    });
    container.querySelector('#ed-meta-title')?.addEventListener('input', (e) => { state.meta_title = e.target.value; });
    container.querySelector('#ed-meta-desc')?.addEventListener('input', (e) => { state.meta_description = e.target.value; });
    container.querySelector('#ed-og-title')?.addEventListener('input', (e) => { state.og_title = e.target.value; });
    container.querySelector('#ed-og-desc')?.addEventListener('input', (e) => { state.og_description = e.target.value; });
    const ogImgInput = container.querySelector('#ed-og-image');
    ogImgInput?.addEventListener('input', (e) => { state.og_image = e.target.value.trim(); });
    container.querySelector('#ed-og-image-pick')?.addEventListener('click', () => {
        openMediaPicker({
            title: '选择 Open Graph 分享图片',
            onSelect(url) {
                state.og_image = url;
                if (ogImgInput) ogImgInput.value = url;
            }
        });
    });
    container.querySelector('#ed-tw-title')?.addEventListener('input', (e) => { state.twitter_title = e.target.value; });
    container.querySelector('#ed-tw-desc')?.addEventListener('input', (e) => { state.twitter_description = e.target.value; });
    const twImgInput = container.querySelector('#ed-tw-image');
    twImgInput?.addEventListener('input', (e) => { state.twitter_image = e.target.value.trim(); });
    container.querySelector('#ed-tw-image-pick')?.addEventListener('click', () => {
        openMediaPicker({
            title: '选择 X / Twitter 卡片图片',
            onSelect(url) {
                state.twitter_image = url;
                if (twImgInput) twImgInput.value = url;
            }
        });
    });
    container.querySelector('#ed-head-inject')?.addEventListener('input', (e) => { state.codeinjection_head = e.target.value; });
    container.querySelector('#ed-foot-inject')?.addEventListener('input', (e) => { state.codeinjection_foot = e.target.value; });
    container.querySelector('#ed-cover-upload').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            toast('正在上传封面图…', 'info', 2000);
            const uploaded = await api.uploadImage(file);
            state.feature_image = uploaded.url;
            coverUrlInput.value = uploaded.url;
            refreshCoverPreview();
            toast('封面图上传成功', 'success');
        } catch (err) {
            toast(`上传封面图失败：${err.message}`, 'error');
        }
    });
    container.querySelector('#ed-cover-pick').addEventListener('click', () => {
        openMediaPicker({
            title: '选择封面图',
            onSelect(url) {
                state.feature_image = url;
                coverUrlInput.value = url;
                refreshCoverPreview();
            }
        });
    });
    container.querySelector('#ed-cover-clear').addEventListener('click', () => {
        state.feature_image = '';
        coverUrlInput.value = '';
        refreshCoverPreview();
    });

    // 保存逻辑
    const saveDocument = async (forceStatus = null) => {
        if (state.saving) return;
        const title = state.title.trim();
        if (!title) {
            toast(`请输入${labelName}标题`, 'warning');
            container.querySelector('#ed-title').focus();
            return;
        }

        state.saving = true;
        const saveBtn = container.querySelector('#ed-save-btn');
        const pubBtn = container.querySelector('#ed-publish-btn');
        saveBtn.disabled = true;
        pubBtn.disabled = true;

        try {
            const targetStatus = forceStatus || state.status;
            const payload = {
                title,
                status: targetStatus,
                custom_excerpt: state.custom_excerpt.trim() || null,
                feature_image: state.feature_image.trim() || null,
                feature_image_alt: state.feature_image_alt.trim() || null,
                feature_image_caption: state.feature_image_caption.trim() || null,
                meta_title: state.meta_title.trim() || null,
                meta_description: state.meta_description.trim() || null,
                og_title: state.og_title.trim() || null,
                og_description: state.og_description.trim() || null,
                og_image: state.og_image.trim() || null,
                twitter_title: state.twitter_title.trim() || null,
                twitter_description: state.twitter_description.trim() || null,
                twitter_image: state.twitter_image.trim() || null,
                codeinjection_head: state.codeinjection_head.trim() || null,
                codeinjection_foot: state.codeinjection_foot.trim() || null
            };
            if (!isPost) {
                payload.show_title_and_feature_image = Boolean(state.show_title_and_feature_image);
            }

            if (state.id) {
                // 仅当正文实际被修改时才更新正文，避免覆盖原有 Ghost Lexical 卡片
                if (state.markdown !== initialMd) {
                    if (state.markdown.trim() === '') {
                        payload.lexical = EMPTY_LEXICAL;
                    } else {
                        payload.html = markdownToHtml(state.markdown);
                    }
                }
            } else if (state.markdown.trim() === '') {
                payload.lexical = EMPTY_LEXICAL;
            } else {
                payload.html = markdownToHtml(state.markdown);
            }

            if (state.slug) payload.slug = state.slug;
            const isoDate = localDateTimeToIso(state.published_at);
            if (isoDate) payload.published_at = isoDate;

            if (isPost) {
                payload.featured = state.featured;
                const tagList = [];
                for (const slug of state.selectedTagSlugs) {
                    const found = allTags.find((t) => t.slug === slug);
                    if (found) {
                        tagList.push({ id: found.id, name: found.name, slug: found.slug });
                    } else {
                        tagList.push({ name: slug, slug });
                    }
                }
                payload.tags = tagList;
            }

            let saved;
            if (state.id) {
                payload.updated_at = state.updated_at;
                saved = isPost ? await api.updatePost(state.id, payload) : await api.updatePage(state.id, payload);
            } else {
                saved = isPost ? await api.createPost(payload) : await api.createPage(payload);
            }

            if (saved) {
                state.id = saved.id;
                state.updated_at = saved.updated_at;
                state.slug = saved.slug || state.slug;
                state.status = saved.status || targetStatus;
                state.url = saved.url || state.url;
                state.published_at = formatDateTimeLocal(saved.published_at);
                initialMd = state.markdown;

                container.querySelector('#ed-slug').value = state.slug;
                const statusSelect = container.querySelector('#ed-status');
                if (statusSelect) {
                    const existingScheduled = statusSelect.querySelector('option[value="scheduled"]');
                    if (state.status === 'scheduled' && !existingScheduled) {
                        const opt = document.createElement('option');
                        opt.value = 'scheduled';
                        opt.textContent = '定时发布';
                        statusSelect.appendChild(opt);
                    }
                    statusSelect.value = state.status;
                }
                container.querySelector('#ed-published-at').value = state.published_at;
                pubBtn.textContent = state.status === 'published' ? '保存并更新发布' : '保存并立即发布';
                refreshTopStatus();
                ctx.setTopbar(`编辑${labelName}`, `当前路径：/${state.slug}/`, '');

                // 更新 URL hash 防止刷新丢失编辑目标
                const targetHash = isPost ? `#posts/edit/${saved.id}` : `#pages/edit/${saved.id}`;
                if (window.location.hash !== targetHash) {
                    history.replaceState(null, '', targetHash);
                }
            }

            toast(forceStatus === 'published' ? `${labelName}已保存并发布` : `${labelName}已保存`, 'success');
        } catch (err) {
            toast(`保存失败：${err.message}`, 'error');
        } finally {
            state.saving = false;
            saveBtn.disabled = false;
            pubBtn.disabled = false;
        }
    };

    container.querySelector('#ed-save-btn').addEventListener('click', () => saveDocument(null));
    container.querySelector('#ed-publish-btn').addEventListener('click', () => saveDocument('published'));
    container.querySelector('#ed-back-btn').addEventListener('click', () => onBack?.());
}
