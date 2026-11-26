import { api } from '../api.js';
import { escapeHtml, escapeAttr, formatBytes, formatDate, copyToClipboard, toast } from '../utils.js';

export async function renderMediaView(container, ctx) {
    ctx.setTopbar('媒体图库', '集中上传并浏览 /content/images/ 中的全部图片，支持一键复制地址', `
        <label class="btn btn-primary btn-sm" style="cursor:pointer;">
            + 上传图片
            <input type="file" id="media-top-upload" accept="image/*" multiple class="hidden">
        </label>
    `);

    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在扫描媒体图库…</span></div>`;

    let images = [];
    let keyword = '';
    let uploading = false;

    const loadImages = async () => {
        const data = await api.getMedia();
        images = data?.images || [];
    };

    try {
        await loadImages();
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载媒体图库失败：${escapeHtml(err.message)}</div>`;
        return;
    }

    const renderGrid = () => {
        const gridWrap = container.querySelector('#media-grid-wrap');
        const countEl = container.querySelector('#media-count');
        const q = keyword.trim().toLowerCase();
        const filtered = q
            ? images.filter((it) => it.name.toLowerCase().includes(q) || it.path.toLowerCase().includes(q))
            : images;

        if (countEl) countEl.textContent = `共 ${filtered.length} 张图片（总计 ${images.length} 张）`;

        if (filtered.length === 0) {
            gridWrap.innerHTML = `<div class="empty-state"><p>${q ? '没有匹配该关键词的图片' : '图库中还没有图片，拖拽图片到上方区域即可上传'}</p></div>`;
            return;
        }

        gridWrap.innerHTML = `
            <div class="media-grid">
                ${filtered.map((img) => `
                    <div class="media-item">
                        <a class="media-thumb" href="${escapeAttr(img.url)}" target="_blank" rel="noopener" title="在新标签页查看原图">
                            <img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.name)}" loading="lazy">
                        </a>
                        <div class="media-meta">
                            <div class="media-name" title="${escapeAttr(img.path)}">${escapeHtml(img.name)}</div>
                            <div class="media-sub">
                                <span>${formatBytes(img.size)}</span>
                                <span>${formatDate(img.mtime).slice(0, 10)}</span>
                            </div>
                        </div>
                        <div class="media-actions">
                            <button type="button" class="btn btn-xs btn-block" data-copy="${escapeAttr(img.url)}">复制地址</button>
                            <button type="button" class="btn btn-xs" data-copy-md="${escapeAttr(`![${img.name.replace(/\.[^.]+$/, '')}](${img.url})`)}" title="复制 Markdown 语法">MD</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        gridWrap.querySelectorAll('[data-copy]').forEach((btn) => {
            btn.addEventListener('click', () => copyToClipboard(btn.dataset.copy));
        });
        gridWrap.querySelectorAll('[data-copy-md]').forEach((btn) => {
            btn.addEventListener('click', () => copyToClipboard(btn.dataset.copyMd));
        });
    };

    const handleFiles = async (fileList) => {
        const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
        if (files.length === 0 || uploading) return;
        uploading = true;
        const statusEl = container.querySelector('#media-drop-status');
        let okCount = 0;

        try {
            for (let i = 0; i < files.length; i++) {
                if (statusEl) statusEl.textContent = `正在上传 (${i + 1}/${files.length})：${files[i].name}…`;
                await api.uploadImage(files[i]);
                okCount++;
            }
            toast(`成功上传 ${okCount} 张图片`, 'success');
            await loadImages();
            renderGrid();
        } catch (err) {
            toast(`上传中断：${err.message}`, 'error');
            if (okCount > 0) {
                await loadImages().catch(() => {});
                renderGrid();
            }
        } finally {
            uploading = false;
            if (statusEl) statusEl.textContent = '支持 JPG / PNG / WebP / GIF / SVG，可一次拖拽多张图片上传';
        }
    };

    container.innerHTML = `
        <div class="card">
            <div class="card-body">
                <div id="media-dropzone" class="dropzone">
                    <strong>点击选择或直接拖拽图片到这里上传</strong>
                    <span id="media-drop-status">支持 JPG / PNG / WebP / GIF / SVG，可一次拖拽多张图片上传</span>
                    <input type="file" id="media-drop-input" accept="image/*" multiple class="hidden">
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">已上传图片库</h3>
                    <p class="card-desc" id="media-count"></p>
                </div>
                <input type="search" id="media-search" class="search-input" placeholder="按文件名或年月路径搜索…">
            </div>
            <div class="card-body" id="media-grid-wrap"></div>
        </div>
    `;

    renderGrid();

    const dropzone = container.querySelector('#media-dropzone');
    const dropInput = container.querySelector('#media-drop-input');

    dropzone.addEventListener('click', () => dropInput.click());
    dropInput.addEventListener('change', () => {
        handleFiles(dropInput.files);
        dropInput.value = '';
    });
    ctx.getTopbarAction('media-top-upload')?.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        e.target.value = '';
    });

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
    });
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        handleFiles(e.dataTransfer?.files);
    });

    container.querySelector('#media-search').addEventListener('input', (e) => {
        keyword = e.target.value;
        renderGrid();
    });
}
