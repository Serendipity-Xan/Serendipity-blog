import { api } from '../api.js';
import { escapeHtml, escapeAttr, formatBytes, formatDateShort, openModal, closeModal, toast } from '../utils.js';

export function openMediaPicker({ title = '从媒体图库选择图片', onSelect } = {}) {
    let images = [];
    let keyword = '';
    let uploading = false;

    openModal({
        title,
        wide: true,
        bodyHtml: `
            <div style="display:flex;flex-direction:column;gap:14px;">
                <div class="toolbar-bar" style="margin-bottom:0;">
                    <input type="search" id="mp-search" class="search-input" placeholder="按文件名或路径搜索图片…">
                    <div class="toolbar-group">
                        <label class="btn btn-primary btn-sm" style="cursor:pointer;">
                            <span id="mp-upload-label">上传新图片</span>
                            <input type="file" id="mp-upload-input" accept="image/*" class="hidden">
                        </label>
                    </div>
                </div>
                <div id="mp-grid-wrap">
                    <div class="loading-state"><div class="spinner"></div><span>正在加载图库…</span></div>
                </div>
            </div>
        `,
        footerHtml: `<button type="button" class="btn" data-modal-close>取消</button>`,
        onMount(dialog) {
            const searchEl = dialog.querySelector('#mp-search');
            const uploadInput = dialog.querySelector('#mp-upload-input');
            const uploadLabel = dialog.querySelector('#mp-upload-label');
            const gridWrap = dialog.querySelector('#mp-grid-wrap');

            const renderGrid = () => {
                const q = keyword.trim().toLowerCase();
                const list = q
                    ? images.filter((it) => it.name.toLowerCase().includes(q) || it.path.toLowerCase().includes(q))
                    : images;

                if (list.length === 0) {
                    gridWrap.innerHTML = `<div class="empty-state"><p>${q ? '没有匹配的图片' : '图库暂无图片，点击右上角上传第一张图片吧'}</p></div>`;
                    return;
                }

                gridWrap.innerHTML = `
                    <div class="media-grid">
                        ${list.map((img) => `
                            <div class="media-item selectable" data-url="${escapeAttr(img.url)}" data-name="${escapeAttr(img.name)}">
                                <div class="media-thumb">
                                    <img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.name)}" loading="lazy">
                                </div>
                                <div class="media-meta">
                                    <div class="media-name" title="${escapeAttr(img.path)}">${escapeHtml(img.name)}</div>
                                    <div class="media-sub">
                                        <span>${formatBytes(img.size)}</span>
                                        <span>${formatDateShort(img.mtime)}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;

                gridWrap.querySelectorAll('.media-item').forEach((card) => {
                    card.addEventListener('click', () => {
                        const url = card.dataset.url;
                        const name = card.dataset.name;
                        closeModal();
                        if (typeof onSelect === 'function') onSelect(url, { name });
                    });
                });
            };

            const loadMedia = async () => {
                try {
                    const data = await api.getMedia();
                    images = data?.images || [];
                    renderGrid();
                } catch (err) {
                    gridWrap.innerHTML = `<div class="form-error">加载图库失败：${escapeHtml(err.message)}</div>`;
                }
            };

            searchEl.addEventListener('input', () => {
                keyword = searchEl.value;
                renderGrid();
            });

            uploadInput.addEventListener('change', async () => {
                const file = uploadInput.files?.[0];
                uploadInput.value = '';
                if (!file || uploading) return;
                uploading = true;
                uploadLabel.textContent = '上传中…';
                try {
                    const uploaded = await api.uploadImage(file);
                    toast('图片上传成功', 'success');
                    closeModal();
                    if (typeof onSelect === 'function') onSelect(uploaded.url, { name: file.name });
                } catch (err) {
                    toast(`上传失败：${err.message}`, 'error');
                    uploading = false;
                    uploadLabel.textContent = '上传新图片';
                }
            });

            loadMedia();
        }
    });
}
