import { api } from '../api.js';
import {
    escapeHtml,
    escapeAttr,
    openModal,
    closeModal,
    confirmModal,
    toast,
    copyToClipboard
} from '../utils.js';

const COMMON_TIMEZONES = [
    { value: 'Asia/Shanghai', label: 'Asia/Shanghai (中国标准时间 UTC+8)' },
    { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (UTC+8)' },
    { value: 'Asia/Taipei', label: 'Asia/Taipei (UTC+8)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
    { value: 'UTC', label: 'UTC (协调世界时)' },
    { value: 'America/New_York', label: 'America/New_York (美东时间)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (美西时间)' },
    { value: 'Europe/London', label: 'Europe/London (伦敦时间)' }
];

const WEBHOOK_EVENTS = [
    { value: 'post.published', label: '文章发布 (post.published)' },
    { value: 'post.edited', label: '文章更新 (post.edited)' },
    { value: 'post.unpublished', label: '文章撤回草稿 (post.unpublished)' },
    { value: 'post.deleted', label: '文章删除 (post.deleted)' },
    { value: 'page.published', label: '页面发布 (page.published)' },
    { value: 'page.edited', label: '页面更新 (page.edited)' },
    { value: 'member.added', label: '会员新增 (member.added)' },
    { value: 'member.edited', label: '会员更新 (member.edited)' },
    { value: 'site.changed', label: '站点任意内容变更 (site.changed)' }
];

const BUILTIN_THEMES = new Set(['casper', 'source']);

function normalizeThemes(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.themes)) return res.themes;
    return [];
}

function normalizeIntegrations(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.integrations)) return res.integrations;
    return [];
}

export async function renderAdvancedView(container, ctx, options = {}) {
    ctx.setTopbar('高级扩展与运维', '代码注入、语言时区、主题、路由 YAML、API 集成密钥与数据备份', '');
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载高级系统配置…</span></div>`;

    let activeTab = options.tab || 'injection'; // injection | themes | integrations | data
    let settingsMap = {};
    let themes = [];
    let routesYaml = '';
    let routesLoaded = false;
    let integrations = [];

    try {
        const [settingsList, themeRes, integRes] = await Promise.all([
            api.getSettings(),
            api.listThemes().catch(() => []),
            api.listIntegrations().catch(() => [])
        ]);
        for (const item of settingsList || []) {
            settingsMap[item.key] = item.value;
        }
        themes = normalizeThemes(themeRes);
        integrations = normalizeIntegrations(integRes);
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载高级配置失败：${escapeHtml(err.message)}</div>`;
        return;
    }

    const injectionState = {
        locale: settingsMap.locale || 'zh',
        timezone: settingsMap.timezone || 'Asia/Shanghai',
        accent_color: settingsMap.accent_color || '#4f6ef7',
        codeinjection_head: settingsMap.codeinjection_head || '',
        codeinjection_foot: settingsMap.codeinjection_foot || ''
    };

    const ensureRoutesLoaded = async () => {
        if (routesLoaded) return;
        try {
            const raw = await api.getRoutesYaml();
            routesYaml = typeof raw === 'string' ? raw : (raw?.routes ?? raw?.yaml ?? '');
            routesLoaded = true;
        } catch (err) {
            routesYaml = '';
            toast(`加载 routes.yaml 失败：${err.message}`, 'warning');
        }
    };

    const reloadThemes = async () => {
        const res = await api.listThemes();
        themes = normalizeThemes(res);
        renderActiveTab();
    };

    const reloadIntegrations = async () => {
        const res = await api.listIntegrations();
        integrations = normalizeIntegrations(res);
        renderActiveTab();
    };

    /* ==================== Tab 1: 代码注入与语言时区 ==================== */
    const renderInjectionTab = (root) => {
        const hasCurrentTz = COMMON_TIMEZONES.some((z) => z.value === injectionState.timezone);
        const tzOptions = hasCurrentTz
            ? COMMON_TIMEZONES
            : [{ value: injectionState.timezone, label: injectionState.timezone }, ...COMMON_TIMEZONES];

        const colorPickerVal = /^#[0-9a-fA-F]{6}$/.test(injectionState.accent_color)
            ? injectionState.accent_color
            : '#4f6ef7';

        root.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">语言、时区与强调色</h3>
                        <p class="card-desc">设置 Ghost 站点语言（locale）、发布时间基准时区与主题默认强调色</p>
                    </div>
                </div>
                <div class="card-body">
                    <div class="form-grid-3">
                        <div class="field">
                            <label for="adv-locale">站点语言（locale）</label>
                            <input type="text" id="adv-locale" list="adv-locale-list" value="${escapeAttr(injectionState.locale)}" placeholder="zh / en">
                            <datalist id="adv-locale-list">
                                <option value="zh">zh</option>
                                <option value="zh-CN">zh-CN</option>
                                <option value="en">en</option>
                                <option value="ja">ja</option>
                            </datalist>
                        </div>
                        <div class="field">
                            <label for="adv-timezone">站点时区（timezone）</label>
                            <select id="adv-timezone">
                                ${tzOptions.map((tz) => `<option value="${escapeAttr(tz.value)}" ${injectionState.timezone === tz.value ? 'selected' : ''}>${escapeHtml(tz.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field">
                            <label for="adv-accent-text">主题强调色（accent_color）</label>
                            <div class="input-with-actions">
                                <input type="color" id="adv-accent-picker" value="${escapeAttr(colorPickerVal)}" style="width:42px;height:36px;padding:2px;border:1px solid var(--border-strong);border-radius:8px;background:#fff;cursor:pointer;flex:none;">
                                <input type="text" id="adv-accent-text" value="${escapeAttr(injectionState.accent_color)}" placeholder="#4f6ef7" style="font-family:var(--font-mono);">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">全局代码注入（Code Injection）</h3>
                        <p class="card-desc">在全站所有页面的 <code>&lt;head&gt;</code> 或 <code>&lt;footer&gt;</code> 区域注入统计脚本、自定义样式或元标签</p>
                    </div>
                </div>
                <div class="card-body">
                    <div class="form-grid" style="grid-template-columns:1fr;">
                        <div class="field">
                            <label for="adv-head">全局 &lt;head&gt; 代码注入</label>
                            <textarea id="adv-head" rows="7" placeholder="<!-- 例如：<link>、<meta> 或 <style> -->" style="font-family:var(--font-mono);font-size:12.5px;line-height:1.6;">${escapeHtml(injectionState.codeinjection_head)}</textarea>
                        </div>
                        <div class="field">
                            <label for="adv-foot">全局 &lt;footer&gt; 代码注入</label>
                            <textarea id="adv-foot" rows="7" placeholder="<!-- 例如：统计分析 <script> 或自定义 JS -->" style="font-family:var(--font-mono);font-size:12.5px;line-height:1.6;">${escapeHtml(injectionState.codeinjection_foot)}</textarea>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <span class="field-hint">保存后将写入 Ghost 全局设置并立即作用于前台页面</span>
                    <button type="button" class="btn btn-primary" id="adv-save-injection">保存代码注入与基础设置</button>
                </div>
            </div>
        `;

        const picker = root.querySelector('#adv-accent-picker');
        const colorText = root.querySelector('#adv-accent-text');
        root.querySelector('#adv-locale').addEventListener('input', (e) => { injectionState.locale = e.target.value; });
        root.querySelector('#adv-timezone').addEventListener('change', (e) => { injectionState.timezone = e.target.value; });
        picker.addEventListener('input', (e) => {
            injectionState.accent_color = e.target.value;
            colorText.value = e.target.value;
        });
        colorText.addEventListener('input', (e) => {
            injectionState.accent_color = e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value.trim())) {
                picker.value = e.target.value.trim();
            }
        });
        root.querySelector('#adv-head').addEventListener('input', (e) => { injectionState.codeinjection_head = e.target.value; });
        root.querySelector('#adv-foot').addEventListener('input', (e) => { injectionState.codeinjection_foot = e.target.value; });

        root.querySelector('#adv-save-injection').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const accent = injectionState.accent_color.trim();
            if (accent && !/^#[0-9a-fA-F]{3,8}$/.test(accent)) {
                toast('强调色格式需为十六进制颜色值，例如 #4f6ef7', 'warning');
                colorText.focus();
                return;
            }
            btn.disabled = true;
            btn.textContent = '保存中…';
            try {
                await api.saveSettings([
                    { key: 'locale', value: injectionState.locale.trim() || 'zh' },
                    { key: 'timezone', value: injectionState.timezone },
                    { key: 'accent_color', value: accent || null },
                    { key: 'codeinjection_head', value: injectionState.codeinjection_head || null },
                    { key: 'codeinjection_foot', value: injectionState.codeinjection_foot || null }
                ]);
                toast('代码注入与语言时区设置已保存', 'success');
            } catch (err) {
                toast(`保存失败：${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '保存代码注入与基础设置';
            }
        });
    };

    /* ==================== Tab 2: 主题与路由 YAML ==================== */
    const renderThemesTab = async (root) => {
        if (!routesLoaded) {
            root.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载主题与 routes.yaml…</span></div>`;
            await ensureRoutesLoaded();
        }

        root.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">主题管理（Themes · 共 ${themes.length} 套）</h3>
                        <p class="card-desc">切换当前启用的 Ghost 主题，或上传新的 <code>.zip</code> 主题压缩包</p>
                    </div>
                    <label class="btn btn-primary btn-sm" style="cursor:pointer;">
                        + 上传 .zip 主题
                        <input type="file" id="adv-theme-upload" accept=".zip,application/zip" class="hidden">
                    </label>
                </div>
                <div class="table-wrap">
                    ${themes.length === 0 ? `
                        <div class="empty-state"><p>暂未获取到主题列表</p></div>
                    ` : `
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>主题名称</th>
                                    <th>版本</th>
                                    <th>状态</th>
                                    <th style="text-align:right;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${themes.map((t) => {
                                    const version = t.package?.version || t.version || '—';
                                    const isActive = Boolean(t.active);
                                    const isBuiltin = BUILTIN_THEMES.has(String(t.name || '').toLowerCase());
                                    const deleteDisabled = isActive || isBuiltin;
                                    return `
                                        <tr data-theme-name="${escapeAttr(t.name)}">
                                            <td>
                                                <div style="font-weight:600;">${escapeHtml(t.name)}</div>
                                                ${t.package?.description ? `<div class="item-sub">${escapeHtml(t.package.description)}</div>` : ''}
                                            </td>
                                            <td><code>${escapeHtml(version)}</code></td>
                                            <td>
                                                ${isActive
                                                    ? '<span class="pill pill-success">当前启用</span>'
                                                    : '<span class="pill pill-muted">未启用</span>'}
                                            </td>
                                            <td>
                                                <div class="row-actions">
                                                    ${isActive
                                                        ? '<button type="button" class="btn btn-sm" disabled>使用中</button>'
                                                        : '<button type="button" class="btn btn-primary btn-sm" data-action="activate">启用</button>'}
                                                    <button type="button" class="btn btn-danger-soft btn-xs" data-action="delete" ${deleteDisabled ? 'disabled' : ''} title="${isActive ? '当前启用中的主题不可删除' : isBuiltin ? '系统内置主题不可删除' : '删除主题'}">
                                                        删除
                                                    </button>
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

            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">动态路由配置（<code>routes.yaml</code>）</h3>
                        <p class="card-desc">直接编辑 Ghost 动态路由、频道与自定义集合映射；保存后立即重载生效</p>
                    </div>
                    <div class="toolbar-group">
                        <button type="button" class="btn btn-sm" id="adv-routes-reload">重新读取</button>
                        <button type="button" class="btn btn-sm" id="adv-routes-download">下载 routes.yaml</button>
                    </div>
                </div>
                <div class="card-body">
                    <textarea id="adv-routes-yaml" rows="14" spellcheck="false" style="font-family:var(--font-mono);font-size:12.5px;line-height:1.65;">${escapeHtml(routesYaml)}</textarea>
                </div>
                <div class="card-footer">
                    <span class="field-hint">修改前建议先点击右上角「下载 routes.yaml」备份当前配置</span>
                    <button type="button" class="btn btn-primary" id="adv-routes-save">保存并生效 routes.yaml</button>
                </div>
            </div>
        `;

        root.querySelector('#adv-theme-upload')?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            toast(`正在上传主题「${file.name}」…`, 'info');
            try {
                await api.uploadThemeZip(file);
                toast(`主题「${file.name}」上传成功`, 'success');
                await reloadThemes();
            } catch (err) {
                toast(`上传主题失败：${err.message}`, 'error');
            }
        });

        root.querySelectorAll('tr[data-theme-name]').forEach((row) => {
            const name = row.dataset.themeName;
            row.querySelector('[data-action="activate"]')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = '切换中…';
                try {
                    await api.activateTheme(name);
                    toast(`已启用主题「${name}」`, 'success');
                    await reloadThemes();
                } catch (err) {
                    toast(`启用主题失败：${err.message}`, 'error');
                    btn.disabled = false;
                    btn.textContent = '启用';
                }
            });

            row.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
                const ok = await confirmModal({
                    title: '删除主题',
                    message: `确定永久删除主题「${name}」吗？删除后主题文件将被移除。`,
                    confirmText: '确认删除',
                    danger: true
                });
                if (!ok) return;
                try {
                    await api.deleteTheme(name);
                    toast(`主题「${name}」已删除`, 'success');
                    await reloadThemes();
                } catch (err) {
                    toast(`删除主题失败：${err.message}`, 'error');
                }
            });
        });

        const yamlEl = root.querySelector('#adv-routes-yaml');
        yamlEl?.addEventListener('input', (e) => { routesYaml = e.target.value; });

        root.querySelector('#adv-routes-reload')?.addEventListener('click', async () => {
            routesLoaded = false;
            await ensureRoutesLoaded();
            if (yamlEl) yamlEl.value = routesYaml;
            toast('已重新读取最新 routes.yaml', 'info');
        });

        root.querySelector('#adv-routes-download')?.addEventListener('click', () => {
            const blob = new Blob([routesYaml || ''], { type: 'text/yaml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'routes.yaml';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });

        root.querySelector('#adv-routes-save')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = '生效中…';
            try {
                await api.uploadRoutesYaml(routesYaml);
                toast('routes.yaml 已保存并生效', 'success');
            } catch (err) {
                toast(`保存 routes.yaml 失败：${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '保存并生效 routes.yaml';
            }
        });
    };

    /* ==================== Tab 3: API 集成与 Webhook ==================== */
    const openCreateIntegrationModal = () => {
        openModal({
            title: '新建自定义集成（Custom Integration）',
            bodyHtml: `
                <div class="form-grid" style="grid-template-columns:1fr;">
                    <div class="field">
                        <label for="int-name">集成名称 *</label>
                        <input type="text" id="int-name" placeholder="例如：自动化发布脚本 / 外部统计服务">
                    </div>
                    <div class="field">
                        <label for="int-desc">用途描述（可选）</label>
                        <textarea id="int-desc" rows="2" placeholder="说明此 API 密钥和 Webhook 的使用场景"></textarea>
                    </div>
                </div>
            `,
            footerHtml: `
                <button type="button" class="btn" data-modal-close>取消</button>
                <button type="button" class="btn btn-primary" id="int-save">创建并生成密钥</button>
            `,
            onMount(dialog) {
                dialog.querySelector('#int-save').addEventListener('click', async (e) => {
                    const name = dialog.querySelector('#int-name').value.trim();
                    const description = dialog.querySelector('#int-desc').value.trim();
                    if (!name) {
                        toast('请输入集成名称', 'warning');
                        dialog.querySelector('#int-name').focus();
                        return;
                    }
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    btn.textContent = '创建中…';
                    try {
                        await api.createIntegration({ name, description: description || null });
                        toast('自定义集成已创建', 'success');
                        closeModal();
                        await reloadIntegrations();
                    } catch (err) {
                        toast(`创建集成失败：${err.message}`, 'error');
                        btn.disabled = false;
                        btn.textContent = '创建并生成密钥';
                    }
                });
            }
        });
    };

    const openEditIntegrationModal = (integ) => {
        openModal({
            title: `编辑集成：${integ.name}`,
            bodyHtml: `
                <div class="form-grid" style="grid-template-columns:1fr;">
                    <div class="field">
                        <label for="int-edit-name">集成名称 *</label>
                        <input type="text" id="int-edit-name" value="${escapeAttr(integ.name || '')}">
                    </div>
                    <div class="field">
                        <label for="int-edit-desc">用途描述</label>
                        <textarea id="int-edit-desc" rows="2">${escapeHtml(integ.description || '')}</textarea>
                    </div>
                </div>
            `,
            footerHtml: `
                <button type="button" class="btn" data-modal-close>取消</button>
                <button type="button" class="btn btn-primary" id="int-edit-save">保存修改</button>
            `,
            onMount(dialog) {
                dialog.querySelector('#int-edit-save').addEventListener('click', async (e) => {
                    const name = dialog.querySelector('#int-edit-name').value.trim();
                    const description = dialog.querySelector('#int-edit-desc').value.trim();
                    if (!name) {
                        toast('请输入集成名称', 'warning');
                        return;
                    }
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    try {
                        await api.updateIntegration(integ.id, { name, description: description || null });
                        toast('集成信息已更新', 'success');
                        closeModal();
                        await reloadIntegrations();
                    } catch (err) {
                        toast(`更新失败：${err.message}`, 'error');
                        btn.disabled = false;
                    }
                });
            }
        });
    };

    const openAddWebhookModal = (integ) => {
        openModal({
            title: `添加 Webhook · ${integ.name}`,
            bodyHtml: `
                <div class="form-grid" style="grid-template-columns:1fr;">
                    <div class="field">
                        <label for="wh-name">Webhook 名称 *</label>
                        <input type="text" id="wh-name" placeholder="例如：文章发布自动通知">
                    </div>
                    <div class="field">
                        <label for="wh-event">触发事件 *</label>
                        <select id="wh-event">
                            ${WEBHOOK_EVENTS.map((ev) => `<option value="${escapeAttr(ev.value)}">${escapeHtml(ev.label)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field">
                        <label for="wh-url">目标回调地址（Target URL）*</label>
                        <input type="url" id="wh-url" placeholder="https://example.com/webhook">
                    </div>
                </div>
            `,
            footerHtml: `
                <button type="button" class="btn" data-modal-close>取消</button>
                <button type="button" class="btn btn-primary" id="wh-save">添加 Webhook</button>
            `,
            onMount(dialog) {
                dialog.querySelector('#wh-save').addEventListener('click', async (e) => {
                    const name = dialog.querySelector('#wh-name').value.trim();
                    const event = dialog.querySelector('#wh-event').value;
                    const targetUrl = dialog.querySelector('#wh-url').value.trim();

                    if (!name) {
                        toast('请填写 Webhook 名称', 'warning');
                        return;
                    }
                    if (!/^https?:\/\/\S+$/i.test(targetUrl)) {
                        toast('请填写以 http:// 或 https:// 开头的有效目标地址', 'warning');
                        return;
                    }

                    const btn = e.currentTarget;
                    btn.disabled = true;
                    btn.textContent = '添加中…';
                    try {
                        await api.createWebhook({
                            integration_id: integ.id,
                            name,
                            event,
                            target_url: targetUrl
                        });
                        toast('Webhook 已添加', 'success');
                        closeModal();
                        await reloadIntegrations();
                    } catch (err) {
                        toast(`添加 Webhook 失败：${err.message}`, 'error');
                        btn.disabled = false;
                        btn.textContent = '添加 Webhook';
                    }
                });
            }
        });
    };

    const renderIntegrationsTab = (root) => {
        root.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">API 集成与 Webhook（共 ${integrations.length} 个）</h3>
                        <p class="card-desc">管理 Ghost Content API Key、Admin API Key 与事件回调 Webhook，方便编写自定义自动化脚本或扩展服务</p>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" id="int-new-btn">+ 新建自定义集成</button>
                </div>
                <div class="card-body">
                    ${integrations.length === 0 ? `
                        <div class="empty-state">
                            <p>暂无自定义 API 集成</p>
                            <button type="button" class="btn btn-primary btn-sm" id="int-empty-new">+ 新建自定义集成</button>
                        </div>
                    ` : `
                        <div style="display:flex;flex-direction:column;gap:16px;">
                            ${integrations.map((integ) => {
                                const apiKeys = Array.isArray(integ.api_keys) ? integ.api_keys : [];
                                const contentKey = apiKeys.find((k) => k.type === 'content');
                                const adminKey = apiKeys.find((k) => k.type === 'admin');
                                const webhooks = Array.isArray(integ.webhooks) ? integ.webhooks : [];
                                const isCustom = !integ.type || integ.type === 'custom';
                                return `
                                    <div class="card" style="margin-bottom:0;background:var(--bg-subtle);" data-integ-id="${escapeAttr(integ.id)}">
                                        <div class="card-header" style="background:#fff;border-radius:var(--radius-lg) var(--radius-lg) 0 0;">
                                            <div>
                                                <div style="display:flex;align-items:center;gap:8px;">
                                                    <h4 class="card-title">${escapeHtml(integ.name)}</h4>
                                                    <span class="pill ${isCustom ? 'pill-primary' : 'pill-muted'}">${isCustom ? '自定义集成' : '内置集成'}</span>
                                                </div>
                                                ${integ.description ? `<p class="card-desc">${escapeHtml(integ.description)}</p>` : ''}
                                            </div>
                                            <div class="toolbar-group">
                                                ${isCustom ? `
                                                    <button type="button" class="btn btn-sm" data-action="add-webhook">+ 添加 Webhook</button>
                                                    <button type="button" class="btn btn-sm" data-action="edit-integ">编辑</button>
                                                    <button type="button" class="btn btn-danger-soft btn-xs" data-action="del-integ">删除</button>
                                                ` : ''}
                                            </div>
                                        </div>
                                        <div class="card-body" style="background:#fff;border-radius:0 0 var(--radius-lg) var(--radius-lg);">
                                            <div class="form-grid" style="margin-bottom:${webhooks.length > 0 ? '16px' : '0'};">
                                                <div class="field">
                                                    <label>Content API Key</label>
                                                    <div class="input-with-actions">
                                                        <input type="text" readonly value="${escapeAttr(contentKey?.secret || '无')}" style="font-family:var(--font-mono);font-size:12px;background:var(--bg-subtle);">
                                                        ${contentKey?.secret ? `<button type="button" class="btn btn-sm" data-copy-key="${escapeAttr(contentKey.secret)}">复制</button>` : ''}
                                                    </div>
                                                </div>
                                                <div class="field">
                                                    <label>Admin API Key</label>
                                                    <div class="input-with-actions">
                                                        <input type="text" readonly value="${escapeAttr(adminKey?.secret || '无')}" style="font-family:var(--font-mono);font-size:12px;background:var(--bg-subtle);">
                                                        ${adminKey?.secret ? `<button type="button" class="btn btn-sm" data-copy-key="${escapeAttr(adminKey.secret)}">复制</button>` : ''}
                                                    </div>
                                                </div>
                                            </div>

                                            ${webhooks.length > 0 ? `
                                                <div style="border-top:1px solid var(--border);padding-top:14px;">
                                                    <div style="font-size:12.5px;font-weight:600;color:var(--ink-secondary);margin-bottom:8px;">已配置 Webhooks（${webhooks.length}）</div>
                                                    <div class="repeater-list">
                                                        ${webhooks.map((wh) => `
                                                            <div class="repeater-row" style="grid-template-columns:1fr auto;padding:9px 12px;">
                                                                <div style="min-width:0;">
                                                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                                                        <strong style="font-size:13px;">${escapeHtml(wh.name || '未命名 Webhook')}</strong>
                                                                        <span class="pill pill-primary">${escapeHtml(wh.event)}</span>
                                                                    </div>
                                                                    <div class="item-sub" style="font-family:var(--font-mono);word-break:break-all;">${escapeHtml(wh.target_url)}</div>
                                                                </div>
                                                                <button type="button" class="btn btn-danger-soft btn-xs" data-del-webhook="${escapeAttr(wh.id)}">删除</button>
                                                            </div>
                                                        `).join('')}
                                                    </div>
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>
            </div>
        `;

        root.querySelector('#int-new-btn')?.addEventListener('click', openCreateIntegrationModal);
        root.querySelector('#int-empty-new')?.addEventListener('click', openCreateIntegrationModal);

        root.querySelectorAll('[data-copy-key]').forEach((btn) => {
            btn.addEventListener('click', () => copyToClipboard(btn.dataset.copyKey));
        });

        root.querySelectorAll('[data-integ-id]').forEach((card) => {
            const integ = integrations.find((x) => x.id === card.dataset.integId);
            if (!integ) return;

            card.querySelector('[data-action="add-webhook"]')?.addEventListener('click', () => openAddWebhookModal(integ));
            card.querySelector('[data-action="edit-integ"]')?.addEventListener('click', () => openEditIntegrationModal(integ));
            card.querySelector('[data-action="del-integ"]')?.addEventListener('click', async () => {
                const ok = await confirmModal({
                    title: '删除自定义集成',
                    message: `确定删除集成「${integ.name}」吗？关联的 API Key 和 Webhook 将立即失效。`,
                    confirmText: '确认删除',
                    danger: true
                });
                if (!ok) return;
                try {
                    await api.deleteIntegration(integ.id);
                    toast('自定义集成已删除', 'success');
                    await reloadIntegrations();
                } catch (err) {
                    toast(`删除集成失败：${err.message}`, 'error');
                }
            });

            card.querySelectorAll('[data-del-webhook]').forEach((btn) => {
                const whId = btn.dataset.delWebhook;
                btn.addEventListener('click', async () => {
                    const ok = await confirmModal({
                        title: '删除 Webhook',
                        message: '确定移除此 Webhook 回调配置吗？',
                        confirmText: '确认删除',
                        danger: true
                    });
                    if (!ok) return;
                    try {
                        await api.deleteWebhook(whId);
                        toast('Webhook 已删除', 'success');
                        await reloadIntegrations();
                    } catch (err) {
                        toast(`删除 Webhook 失败：${err.message}`, 'error');
                    }
                });
            });
        });
    };

    /* ==================== Tab 4: 数据备份与导入导出 ==================== */
    const renderDataTab = (root) => {
        root.innerHTML = `
            <div class="form-grid">
                <div class="card" style="margin-bottom:0;">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">全站 JSON 内容备份导出</h3>
                            <p class="card-desc">导出包含全部文章、页面、标签、设置与会员关联的完整 Ghost JSON 数据库备份包</p>
                        </div>
                    </div>
                    <div class="card-footer">
                        <span class="field-hint">建议在重大升级或迁移前下载备份</span>
                        <a href="/api/admin/ghost/db/" download class="btn btn-primary btn-sm">导出全站 JSON 备份</a>
                    </div>
                </div>

                <div class="card" style="margin-bottom:0;">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">导出全站文章 CSV</h3>
                            <p class="card-desc">以 CSV 表格格式导出全站文章清单、状态、发布时间与元信息，便于数据分析</p>
                        </div>
                    </div>
                    <div class="card-footer">
                        <span class="field-hint">兼容 Excel / Google Sheets 打开</span>
                        <a href="/api/admin/ghost/posts/export/" download class="btn btn-sm">导出文章 CSV</a>
                    </div>
                </div>

                <div class="card" style="margin-bottom:0;">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">导出会员 CSV</h3>
                            <p class="card-desc">导出所有注册会员的姓名、邮箱、订阅状态、标签与备注信息</p>
                        </div>
                    </div>
                    <div class="card-footer">
                        <span class="field-hint">包含全部已注册会员</span>
                        <a href="/api/admin/ghost/members/upload/?limit=all" download class="btn btn-sm">导出会员 CSV</a>
                    </div>
                </div>

                <div class="card" style="margin-bottom:0;">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">导入 Ghost JSON 备份包</h3>
                            <p class="card-desc">上传标准的 Ghost <code>.json</code> 导出文件以合并导入文章、标签与站点数据</p>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="field">
                            <label for="adv-db-file">选择 .json 备份文件</label>
                            <div class="input-with-actions">
                                <input type="file" id="adv-db-file" accept=".json,application/json">
                                <button type="button" class="btn btn-primary btn-sm" id="adv-db-import-btn">导入 JSON 备份</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        root.querySelector('#adv-db-import-btn')?.addEventListener('click', async (e) => {
            const fileInput = root.querySelector('#adv-db-file');
            const file = fileInput?.files?.[0];
            if (!file) {
                toast('请先选择一个 Ghost .json 备份文件', 'warning');
                return;
            }
            const ok = await confirmModal({
                title: '导入 Ghost JSON 备份包',
                message: `确定要导入备份文件「${file.name}」吗？该操作会将备份中的文章、标签与设置合并写入当前数据库，建议提前导出当前备份。`,
                confirmText: '确认导入',
                danger: true
            });
            if (!ok) return;

            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = '导入中…';
            try {
                const res = await api.importDb(file);
                fileInput.value = '';
                const warnings = res?.problems?.length || 0;
                toast(
                    warnings > 0
                        ? `数据已导入（包含 ${warnings} 条兼容提示，部分重复项已跳过）`
                        : 'Ghost JSON 备份包导入成功',
                    warnings > 0 ? 'warning' : 'success'
                );
            } catch (err) {
                toast(`导入失败：${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '导入 JSON 备份';
            }
        });
    };

    const renderActiveTab = () => {
        const body = container.querySelector('#advanced-tab-body');
        if (!body) return;
        if (activeTab === 'injection') renderInjectionTab(body);
        else if (activeTab === 'themes') renderThemesTab(body);
        else if (activeTab === 'integrations') renderIntegrationsTab(body);
        else renderDataTab(body);
    };

    const renderShell = () => {
        container.innerHTML = `
            <div style="margin-bottom:18px;">
                <div class="tabs" id="advanced-tabs">
                    <button type="button" class="tab-btn ${activeTab === 'injection' ? 'active' : ''}" data-tab="injection">代码注入与语言时区</button>
                    <button type="button" class="tab-btn ${activeTab === 'themes' ? 'active' : ''}" data-tab="themes">主题与路由 YAML</button>
                    <button type="button" class="tab-btn ${activeTab === 'integrations' ? 'active' : ''}" data-tab="integrations">API 集成与 Webhook</button>
                    <button type="button" class="tab-btn ${activeTab === 'data' ? 'active' : ''}" data-tab="data">数据备份与导入导出</button>
                </div>
            </div>
            <div id="advanced-tab-body"></div>
        `;

        container.querySelector('#advanced-tabs').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-tab]');
            if (!btn) return;
            activeTab = btn.dataset.tab;
            container.querySelectorAll('#advanced-tabs .tab-btn').forEach((b) => {
                b.classList.toggle('active', b.dataset.tab === activeTab);
            });
            renderActiveTab();
        });

        renderActiveTab();
    };

    renderShell();
}
