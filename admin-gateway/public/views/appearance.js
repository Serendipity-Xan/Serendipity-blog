import { api } from '../api.js';
import { openMediaPicker } from '../components/media-picker.js';
import { escapeHtml, escapeAttr, uid, moveItem, cloneDeep, toast } from '../utils.js';

const LIGHT_PRESETS = [
    { id: 'dark', label: '暗调背景', values: [0.08, 0.08, 0.10] },
    { id: 'medium', label: '中等明度', values: [0.26, 0.30, 0.20] },
    { id: 'bright', label: '亮调背景', values: [0.48, 0.45, 0.44] }
];

const ATMOSPHERE_OPTIONS = {
    off: '关闭',
    mist: '微光星尘与晨雾',
    petals: '樱花',
    rain: '细雨',
    fireflies: '萤火'
};
const EFFECT_TOGGLE_GROUPS = [
    ['基础特效', { particles: '氛围粒子总开关', prism: '棱镜流光边框', cardTilt: '卡片 3D 倾斜', sparks: '点击流星涟漪' }],
    ['粒子作用域', { scopeHome: '首页', scopeArchive: '文章', scopeLife: '生活', scopeToolbox: '工具箱', scopeAbout: '关于', scopePost: '文章详情页' }],
    ['更多特效', { meteor: '彗星掠过', parallax: '壁纸视差', thread: '红绳光标', progress: '彗星阅读进度', transitions: '页面转场', easter: '彩蛋', readingGlow: '读完余光' }]
];

function renderEffectControls(effects) {
    const range = (name, label, max = 100) => `
        <div class="field effect-range">
            <label for="effect-${name}">${label} <output for="effect-${name}">${effects[name]}%</output></label>
            <input type="range" id="effect-${name}" name="${name}" min="0" max="${max}" step="1" value="${effects[name]}">
        </div>
    `;
    const toggle = (name, label) => `
        <label class="check-row">
            <input type="checkbox" name="${name}" ${effects[name] ? 'checked' : ''}>
            <span>${label}</span>
        </label>
    `;
    return `
        <fieldset id="site-effects-controls" class="effects-controls" aria-labelledby="site-effects-title">
            ${toggle('enabled', '视觉特效总开关')}
            <div class="form-grid">
                <div class="field">
                    <label for="effect-atmosphere">氛围粒子</label>
                    <select id="effect-atmosphere" name="atmosphere">
                        ${Object.entries(ATMOSPHERE_OPTIONS).map(([value, label]) =>
                            `<option value="${value}" ${effects.atmosphere === value ? 'selected' : ''}>${label}</option>`).join('')}
                    </select>
                </div>
                ${range('readingDepth', '文章底衬深度', 88)}
                ${range('frequency', '粒子频率')}
                ${range('size', '粒子大小')}
            </div>
            ${EFFECT_TOGGLE_GROUPS.map(([title, toggles]) => `
                <fieldset class="effect-toggles">
                    <legend>${title}</legend>
                    ${Object.entries(toggles).map(([name, label]) => toggle(name, label)).join('')}
                </fieldset>
            `).join('')}
        </fieldset>
    `;
}

function detectLightLevel(light) {
    const arr = Array.isArray(light) && light.length === 3 ? light : [0.24, 0.30, 0.20];
    const avg = (Number(arr[0]) + Number(arr[1]) + Number(arr[2])) / 3;
    if (avg < 0.16) return 'dark';
    if (avg > 0.38) return 'bright';
    return 'medium';
}

export async function renderAppearanceView(container, ctx) {
    ctx.setTopbar('外观与壁纸库', '管理博客的主题、特效与壁纸', `
        <button type="button" class="btn btn-primary btn-sm" id="app-top-save">保存外观设置</button>
    `);

    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载外观设置与壁纸库…</span></div>`;

    let siteConfig = null;
    let themeSettings = [];
    let themeSettingsFailed = false;

    try {
        const [cfg, custom] = await Promise.all([
            api.getSiteConfig(),
            api.getCustomThemeSettings().catch(() => {
                themeSettingsFailed = true;
                return [];
            })
        ]);
        siteConfig = cloneDeep(cfg);
        themeSettings = custom || [];
        if (themeSettingsFailed) {
            toast('未能加载 Ghost 主题明暗设置，仍可保存特效和壁纸', 'warning');
        }
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载外观配置失败：${escapeHtml(err.message)}</div>`;
        return;
    }

    const wallpapers = siteConfig.wallpapers || { defaultId: 'meteor-sky', presets: [] };
    if (!Array.isArray(wallpapers.presets)) wallpapers.presets = [];

    const colorSchemeItem = themeSettings.find((i) => i.key === 'color_scheme');
    let colorScheme = colorSchemeItem?.value || 'Light';
    let saving = false;

    const saveAll = async () => {
        if (saving) return;
        saving = true;
        const btns = [ctx.getTopbarAction('app-top-save'), container.querySelector('#app-bottom-save')].filter(Boolean);
        btns.forEach((b) => { b.disabled = true; b.textContent = '保存中…'; });
        effectControls.disabled = true;

        try {
            const defaultPresetRef = wallpapers.presets.find((p) => p.id === wallpapers.defaultId) || null;
            const seenIds = new Set();
            let defaultId = wallpapers.defaultId;
            let adjustedIds = false;

            const cleanedPresets = wallpapers.presets
                .filter((p) => (p.url || '').trim())
                .map((p) => {
                    let nextId = (p.id || '').trim();
                    if (!nextId) {
                        nextId = uid('wp');
                        adjustedIds = true;
                    }
                    if (seenIds.has(nextId)) {
                        const base = nextId;
                        let suffix = 2;
                        while (seenIds.has(`${base}-${suffix}`)) suffix++;
                        nextId = `${base}-${suffix}`;
                        adjustedIds = true;
                    }
                    seenIds.add(nextId);
                    if (p === defaultPresetRef) {
                        defaultId = nextId;
                    }
                    return {
                        id: nextId,
                        label: (p.label || '未命名壁纸').trim(),
                        url: (p.url || '').trim(),
                        phone: (p.phone || '').trim(),
                        colors: Array.isArray(p.colors) && p.colors.length === 3 ? p.colors : ['#7c8cff', '#b388ff', '#ff9b85'],
                        light: Array.isArray(p.light) && p.light.length === 3 ? p.light.map((n) => Number(n) || 0) : [0.24, 0.30, 0.20]
                    };
                });

            if (cleanedPresets.length > 0 && !cleanedPresets.some((p) => p.id === defaultId)) {
                defaultId = cleanedPresets[0].id;
            }

            const patch = {
                wallpapers: {
                    defaultId,
                    presets: cleanedPresets
                }
            };
            const changedEffects = Object.fromEntries(effectFields.map((field) => {
                const value = field.type === 'checkbox' ? field.checked
                    : field.type === 'range' ? field.valueAsNumber : field.value;
                return [field.name, value];
            }).filter(([name, value]) => value !== siteConfig.effects[name]));
            if (Object.keys(changedEffects).length) patch.effects = changedEffects;

            const res = await api.patchSiteConfig(patch);
            siteConfig = cloneDeep(res.config);
            wallpapers.defaultId = siteConfig.wallpapers.defaultId;
            wallpapers.presets = siteConfig.wallpapers.presets;
            for (const field of effectFields) {
                const value = siteConfig.effects[field.name];
                if (field.type === 'checkbox') field.checked = value;
                else field.value = value;
                if (field.type === 'range') showEffectRange(field);
            }

            let themeSyncFailed = false;
            if (colorSchemeItem && themeSettings.find((item) => item.key === 'color_scheme')?.value !== colorScheme) {
                const updatedTheme = themeSettings.map((item) =>
                    item.key === 'color_scheme' ? { ...item, value: colorScheme } : item
                );
                try {
                    themeSettings = await api.saveCustomThemeSettings(updatedTheme);
                } catch {
                    themeSyncFailed = true;
                }
            }

            if (themeSyncFailed) {
                toast('特效和壁纸已保存，但同步默认明暗模式失败', 'warning');
            } else if (adjustedIds) {
                toast('外观与壁纸库已保存（已自动修正空白或重复的壁纸 ID）', 'success');
            } else {
                toast('外观设置已保存，刷新前台即可生效', 'success');
            }
            renderWallpapers();
        } catch (err) {
            toast(`保存失败：${err.message}`, 'error');
        } finally {
            saving = false;
            effectControls.disabled = false;
            btns.forEach((b) => { b.disabled = false; b.textContent = '保存外观设置'; });
        }
    };

    const renderWallpapers = () => {
        const listEl = container.querySelector('#wp-list');
        if (!listEl) return;

        if (wallpapers.presets.length === 0) {
            listEl.innerHTML = `<div class="empty-state"><p>暂无预设壁纸，点击右上角「新增壁纸」添加</p></div>`;
            return;
        }

        listEl.innerHTML = wallpapers.presets.map((wp, idx) => {
            const isDef = wp.id === wallpapers.defaultId;
            const colors = Array.isArray(wp.colors) && wp.colors.length === 3 ? wp.colors : ['#7c8cff', '#b388ff', '#ff9b85'];
            const level = detectLightLevel(wp.light);
            return `
                <div class="wallpaper-card ${isDef ? 'is-default' : ''}" data-idx="${idx}">
                    <div>
                        <div class="wallpaper-thumb-box">
                            ${wp.url ? `<img src="${escapeAttr(wp.url)}" alt="${escapeAttr(wp.label || '')}">` : ''}
                        </div>
                        <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:6px;">
                            <label class="check-row" style="font-size:13px;font-weight:600;">
                                <input type="radio" name="wp-default" value="${escapeAttr(wp.id)}" ${isDef ? 'checked' : ''}>
                                <span>设为默认壁纸</span>
                            </label>
                            ${isDef ? '<span class="pill pill-primary">当前默认</span>' : ''}
                        </div>
                        <div class="toolbar-group" style="margin-top:8px;gap:6px;">
                            <button type="button" class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''} title="上移">↑</button>
                            <button type="button" class="icon-btn" data-action="down" ${idx === wallpapers.presets.length - 1 ? 'disabled' : ''} title="下移">↓</button>
                            <button type="button" class="btn btn-danger-soft btn-xs" data-action="remove" style="margin-left:auto;">删除</button>
                        </div>
                    </div>

                    <div class="form-grid" style="gap:12px 16px;">
                        <div class="field">
                            <label>壁纸名称</label>
                            <input type="text" data-field="label" value="${escapeAttr(wp.label || '')}" placeholder="例如：暮霞彗星星空">
                        </div>
                        <div class="field">
                            <label>唯一标识 ID</label>
                            <input type="text" data-field="id" value="${escapeAttr(wp.id || '')}" placeholder="例如：meteor-sky">
                        </div>
                        <div class="field col-span-2">
                            <label>桌面端壁纸地址（必填）</label>
                            <div class="input-with-actions">
                                <input type="text" data-field="url" value="${escapeAttr(wp.url || '')}" placeholder="/assets/images/bg/01.webp 或 /content/images/...">
                                <label class="btn btn-sm" style="cursor:pointer;">
                                    上传
                                    <input type="file" accept="image/*" class="hidden" data-action="upload-desktop">
                                </label>
                                <button type="button" class="btn btn-sm" data-action="pick-desktop">图库</button>
                            </div>
                        </div>
                        <div class="field col-span-2">
                            <label>移动端竖屏壁纸地址（可选，留空复用桌面图）</label>
                            <div class="input-with-actions">
                                <input type="text" data-field="phone" value="${escapeAttr(wp.phone || '')}" placeholder="留空自动使用桌面壁纸">
                                <label class="btn btn-sm" style="cursor:pointer;">
                                    上传
                                    <input type="file" accept="image/*" class="hidden" data-action="upload-phone">
                                </label>
                                <button type="button" class="btn btn-sm" data-action="pick-phone">图库</button>
                            </div>
                        </div>
                        <div class="field">
                            <label>3 色氛围主题色板</label>
                            <div class="wallpaper-swatches">
                                ${[0, 1, 2].map((ci) => `
                                    <label class="color-picker-chip">
                                        <input type="color" data-color="${ci}" value="${escapeAttr(colors[ci])}">
                                        <span>${escapeHtml(colors[ci])}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                        <div class="field">
                            <label>壁纸亮度档位（影响毛玻璃对比度）</label>
                            <div class="toolbar-group" style="margin-top:6px;">
                                ${LIGHT_PRESETS.map((lp) => `
                                    <button type="button" class="btn btn-xs ${level === lp.id ? 'btn-primary' : ''}" data-light="${lp.id}">${lp.label}</button>
                                `).join('')}
                            </div>
                            <p class="field-hint">当前亮度权重：[${(wp.light || [0.24, 0.30, 0.20]).join(', ')}]</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.wallpaper-card').forEach((card) => {
            const idx = Number(card.dataset.idx);
            const wp = wallpapers.presets[idx];
            if (!wp) return;

            card.querySelector('input[name="wp-default"]').addEventListener('change', () => {
                wallpapers.defaultId = wp.id;
                renderWallpapers();
            });
            card.querySelector('[data-field="label"]').addEventListener('input', (e) => { wp.label = e.target.value; });
            card.querySelector('[data-field="id"]').addEventListener('input', (e) => {
                const wasDef = wallpapers.defaultId === wp.id;
                wp.id = e.target.value.trim();
                if (wasDef) wallpapers.defaultId = wp.id;
            });
            card.querySelector('[data-field="url"]').addEventListener('change', (e) => {
                wp.url = e.target.value.trim();
                renderWallpapers();
            });
            card.querySelector('[data-field="phone"]').addEventListener('input', (e) => {
                wp.phone = e.target.value.trim();
            });

            card.querySelector('[data-action="upload-desktop"]').addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                    toast('正在上传桌面壁纸…', 'info', 2000);
                    const up = await api.uploadImage(file);
                    wp.url = up.url;
                    renderWallpapers();
                    toast('桌面壁纸上传成功，请记得点击保存', 'success');
                } catch (err) {
                    toast(`上传失败：${err.message}`, 'error');
                }
            });
            card.querySelector('[data-action="pick-desktop"]').addEventListener('click', () => {
                openMediaPicker({
                    title: '选择桌面壁纸',
                    onSelect(url) {
                        wp.url = url;
                        renderWallpapers();
                    }
                });
            });
            card.querySelector('[data-action="upload-phone"]').addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                    toast('正在上传移动端壁纸…', 'info', 2000);
                    const up = await api.uploadImage(file);
                    wp.phone = up.url;
                    renderWallpapers();
                    toast('移动端壁纸上传成功', 'success');
                } catch (err) {
                    toast(`上传失败：${err.message}`, 'error');
                }
            });
            card.querySelector('[data-action="pick-phone"]').addEventListener('click', () => {
                openMediaPicker({
                    title: '选择移动端壁纸',
                    onSelect(url) {
                        wp.phone = url;
                        renderWallpapers();
                    }
                });
            });

            card.querySelectorAll('input[type="color"]').forEach((colorInput) => {
                colorInput.addEventListener('input', () => {
                    const ci = Number(colorInput.dataset.color);
                    if (!Array.isArray(wp.colors) || wp.colors.length !== 3) {
                        wp.colors = ['#7c8cff', '#b388ff', '#ff9b85'];
                    }
                    wp.colors[ci] = colorInput.value;
                    const labelSpan = colorInput.parentElement.querySelector('span');
                    if (labelSpan) labelSpan.textContent = colorInput.value;
                });
            });

            card.querySelectorAll('[data-light]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const preset = LIGHT_PRESETS.find((p) => p.id === btn.dataset.light);
                    if (preset) {
                        wp.light = [...preset.values];
                        renderWallpapers();
                    }
                });
            });

            card.querySelector('[data-action="up"]').addEventListener('click', () => {
                if (moveItem(wallpapers.presets, idx, -1)) renderWallpapers();
            });
            card.querySelector('[data-action="down"]').addEventListener('click', () => {
                if (moveItem(wallpapers.presets, idx, 1)) renderWallpapers();
            });
            card.querySelector('[data-action="remove"]').addEventListener('click', () => {
                wallpapers.presets.splice(idx, 1);
                if (wallpapers.defaultId === wp.id && wallpapers.presets[0]) {
                    wallpapers.defaultId = wallpapers.presets[0].id;
                }
                renderWallpapers();
            });
        });
    };

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">默认明暗主题模式</h3>
                    <p class="card-desc">控制首次访问博客时的默认色彩模式（同步 Ghost 主题设置 <code>color_scheme</code>，访客仍可在前台手动切换）</p>
                </div>
            </div>
            <div class="card-body">
                <div class="toolbar-group" style="gap:18px;">
                    <label class="check-row">
                        <input type="radio" name="color-scheme" value="Light" ${colorScheme === 'Light' ? 'checked' : ''}>
                        <span>☀ 浅色模式（Light）</span>
                    </label>
                    <label class="check-row">
                        <input type="radio" name="color-scheme" value="Dark" ${colorScheme === 'Dark' ? 'checked' : ''}>
                        <span>🌙 深色模式（Dark）</span>
                    </label>
                    <label class="check-row">
                        <input type="radio" name="color-scheme" value="Auto" ${colorScheme === 'Auto' ? 'checked' : ''}>
                        <span>◐ 跟随访客系统（Auto）</span>
                    </label>
                </div>
            </div>
        </div>

        <section class="card" aria-labelledby="site-effects-title">
            <div class="card-header">
                <div>
                    <h3 class="card-title" id="site-effects-title">前台特效默认设置</h3>
                    <p class="card-desc">用于首次访问和「恢复默认」，访客仍可保留自己的设置。</p>
                </div>
            </div>
            <div class="card-body">
                ${renderEffectControls(siteConfig.effects)}
            </div>
        </section>

        <div class="card">
            <div class="card-header">
                <div>
                    <h3 class="card-title">全站预设壁纸库</h3>
                    <p class="card-desc">控制前台背景壁纸切换面板中的所有可选壁纸、默认壁纸以及对应的三色光晕主题</p>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="wp-add-btn">+ 新增壁纸</button>
            </div>
            <div class="card-body">
                <div id="wp-list" class="wallpaper-list"></div>
            </div>
            <div class="card-footer">
                <span class="field-hint">修改壁纸顺序、配色或默认项后请点击保存</span>
                <button type="button" class="btn btn-primary" id="app-bottom-save">保存外观设置</button>
            </div>
        </div>
    `;

    const effectControls = container.querySelector('#site-effects-controls');
    const effectFields = Array.from(effectControls.elements).filter((field) => field.name);
    const showEffectRange = (field) => {
        effectControls.querySelector(`output[for="${field.id}"]`).value = `${field.value}%`;
    };
    effectControls.addEventListener('input', (event) => {
        if (event.target.type === 'range') showEffectRange(event.target);
    });

    renderWallpapers();

    container.querySelectorAll('input[name="color-scheme"]').forEach((radio) => {
        radio.addEventListener('change', () => { colorScheme = radio.value; });
    });

    container.querySelector('#wp-add-btn').addEventListener('click', () => {
        wallpapers.presets.push({
            id: uid('wp'),
            label: '新预设壁纸',
            url: '',
            phone: '',
            colors: ['#7c8cff', '#b388ff', '#ff9b85'],
            light: [0.26, 0.30, 0.20]
        });
        renderWallpapers();
    });

    ctx.getTopbarAction('app-top-save')?.addEventListener('click', saveAll);
    container.querySelector('#app-bottom-save').addEventListener('click', saveAll);
}
