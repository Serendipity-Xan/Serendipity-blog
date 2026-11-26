import { api } from '../api.js';
import {
    escapeHtml,
    escapeAttr,
    formatDate,
    openModal,
    closeModal,
    confirmModal,
    toast
} from '../utils.js';

const MEMBER_STATUS_META = {
    free: { label: '免费会员', cls: 'pill-muted' },
    paid: { label: '付费会员', cls: 'pill-success' },
    comped: { label: '赠阅会员', cls: 'pill-primary' }
};

const OFFER_DURATION_LABELS = {
    once: '仅首期',
    repeating: '连续多期',
    forever: '永久有效',
    trial: '免费试用'
};

function normalizeArray(res, key) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res[key])) return res[key];
    return [];
}

function formatMinorPrice(amount, currency = 'USD') {
    const num = Number(amount || 0);
    if (!Number.isFinite(num) || num <= 0) return '免费';
    return `${(num / 100).toFixed(2)} ${String(currency || 'USD').toUpperCase()}`;
}

function formatOfferAmount(offer) {
    if (offer.type === 'percent') {
        return `${Number(offer.amount || 0)}% 折扣`;
    }
    if (offer.type === 'trial') {
        return `试用 ${Number(offer.amount || 0)} 天`;
    }
    return `减免 ${formatMinorPrice(offer.amount, offer.currency || 'USD')}`;
}

export async function renderMembersView(container, ctx, options = {}) {
    let activeTab = options.tab || 'members'; // members | tiers | newsletters
    let settingsMap = {};
    let membersState = {
        items: [],
        meta: { pagination: { page: 1, pages: 1, total: 0 } },
        page: 1,
        limit: 20,
        search: ''
    };
    let tiers = [];
    let offers = [];
    let newsletters = [];
    let searchTimer = null;

    const openMemberModal = (member = null) => {
        const isEdit = Boolean(member);
        const defaultSubscribed = isEdit ? Boolean(member.subscribed) : true;
        openModal({
            title: isEdit ? `编辑会员：${member.name || member.email}` : '新增会员',
            bodyHtml: `
                <div class="form-grid">
                    <div class="field">
                        <label for="mb-name">会员姓名</label>
                        <input type="text" id="mb-name" value="${escapeAttr(member?.name || '')}" placeholder="例如：张三">
                    </div>
                    <div class="field">
                        <label for="mb-email">电子邮箱 *</label>
                        <input type="email" id="mb-email" value="${escapeAttr(member?.email || '')}" placeholder="member@example.com">
                    </div>
                    <div class="field col-span-2">
                        <label for="mb-note">管理员备注（仅后台可见）</label>
                        <textarea id="mb-note" rows="3" maxlength="2000" placeholder="记录会员来源、沟通备注等信息">${escapeHtml(member?.note || '')}</textarea>
                    </div>
                    <div class="field col-span-2">
                        <label class="check-row">
                            <input type="checkbox" id="mb-subscribed" ${defaultSubscribed ? 'checked' : ''}>
                            <span>订阅邮件简报（Subscribed to newsletters）</span>
                        </label>
                    </div>
                </div>
            `,
            footerHtml: `
                <button type="button" class="btn" data-modal-close>取消</button>
                <button type="button" class="btn btn-primary" id="mb-save">${isEdit ? '保存修改' : '创建会员'}</button>
            `,
            onMount(dialog) {
                dialog.querySelector('#mb-save').addEventListener('click', async (e) => {
                    const name = dialog.querySelector('#mb-name').value.trim();
                    const email = dialog.querySelector('#mb-email').value.trim();
                    const note = dialog.querySelector('#mb-note').value.trim();
                    const subscribed = dialog.querySelector('#mb-subscribed').checked;

                    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        toast('请输入有效的电子邮箱地址', 'warning');
                        dialog.querySelector('#mb-email').focus();
                        return;
                    }

                    const btn = e.currentTarget;
                    btn.disabled = true;
                    btn.textContent = '保存中…';
                    try {
                        const payload = {
                            name: name || null,
                            email,
                            note: note || null,
                            subscribed
                        };
                        if (isEdit) {
                            await api.updateMember(member.id, payload);
                            toast('会员信息已更新', 'success');
                        } else {
                            await api.createMember(payload);
                            toast('新会员已创建', 'success');
                        }
                        closeModal();
                        if (activeTab !== 'members') {
                            activeTab = 'members';
                            renderShell();
                        } else {
                            await loadMembersPage(isEdit ? membersState.page : 1);
                        }
                    } catch (err) {
                        toast(`保存会员失败：${err.message}`, 'error');
                        btn.disabled = false;
                        btn.textContent = isEdit ? '保存修改' : '创建会员';
                    }
                });
            }
        });
    };

    ctx.setTopbar(
        '会员与订阅',
        '管理注册会员、订阅方案、优惠券与邮件简报（支持未来开启会员扩展）',
        '<button type="button" class="btn btn-primary btn-sm" id="members-new-btn">+ 新增会员</button>'
    );
    ctx.getTopbarAction('members-new-btn')?.addEventListener('click', () => openMemberModal(null));

    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载会员与订阅数据…</span></div>`;

    try {
        const [settingsList, memberRes, tierRes, offerRes, newsletterRes] = await Promise.all([
            api.getSettings(),
            api.listMembers(1, membersState.limit, ''),
            api.listTiers().catch(() => []),
            api.listOffers().catch(() => []),
            api.listNewsletters().catch(() => [])
        ]);
        for (const item of settingsList || []) {
            settingsMap[item.key] = item.value;
        }
        membersState.items = memberRes?.members || [];
        membersState.meta = memberRes?.meta || membersState.meta;
        tiers = normalizeArray(tierRes, 'tiers');
        offers = normalizeArray(offerRes, 'offers');
        newsletters = normalizeArray(newsletterRes, 'newsletters');
    } catch (err) {
        container.innerHTML = `<div class="form-error">加载会员与订阅数据失败：${escapeHtml(err.message)}</div>`;
        return;
    }

    const loadMembersPage = async (page = 1) => {
        membersState.page = page;
        const wrap = container.querySelector('#members-table-wrap');
        if (wrap) {
            wrap.innerHTML = `<div class="loading-state" style="padding:32px;"><div class="spinner"></div><span>正在加载会员列表…</span></div>`;
        }
        try {
            const res = await api.listMembers(page, membersState.limit, membersState.search.trim());
            membersState.items = res?.members || [];
            membersState.meta = res?.meta || { pagination: { page, pages: 1, total: membersState.items.length } };
            renderMembersTable();
        } catch (err) {
            if (wrap) {
                wrap.innerHTML = `<div class="card-body"><div class="form-error">加载会员列表失败：${escapeHtml(err.message)}</div></div>`;
            } else {
                toast(`加载会员失败：${err.message}`, 'error');
            }
        }
    };

    const reloadTiersAndOffers = async () => {
        const [tierRes, offerRes] = await Promise.all([
            api.listTiers(),
            api.listOffers()
        ]);
        tiers = normalizeArray(tierRes, 'tiers');
        offers = normalizeArray(offerRes, 'offers');
        renderActiveTab();
    };

    const reloadNewsletters = async () => {
        const res = await api.listNewsletters();
        newsletters = normalizeArray(res, 'newsletters');
        renderActiveTab();
    };

    /* ==================== Tab 1: 会员列表 ==================== */
    const renderMembersTable = () => {
        const wrap = container.querySelector('#members-table-wrap');
        const footer = container.querySelector('#members-pagination-footer');
        const countEl = container.querySelector('#members-total-hint');
        if (!wrap) return;

        const pagination = membersState.meta?.pagination || { page: membersState.page, pages: 1, total: membersState.items.length };
        const total = pagination.total ?? membersState.items.length;
        if (countEl) countEl.textContent = `共 ${total} 位会员`;

        if (membersState.items.length === 0) {
            wrap.innerHTML = `
                <div class="empty-state">
                    <p>${membersState.search.trim() ? '未找到匹配的会员记录' : '当前暂无注册会员'}</p>
                    <button type="button" class="btn btn-primary btn-sm" id="members-empty-add">+ 新增会员</button>
                </div>
            `;
            wrap.querySelector('#members-empty-add')?.addEventListener('click', () => openMemberModal(null));
        } else {
            wrap.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>会员</th>
                            <th>订阅状态</th>
                            <th>标签</th>
                            <th>邮件订阅</th>
                            <th>注册时间</th>
                            <th style="text-align:right;">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${membersState.items.map((m) => {
                            const st = MEMBER_STATUS_META[m.status] || { label: m.status || '免费会员', cls: 'pill-muted' };
                            const labels = Array.isArray(m.labels) ? m.labels : [];
                            return `
                                <tr data-member-id="${escapeAttr(m.id)}">
                                    <td>
                                        <div style="font-weight:600;color:var(--ink);">${escapeHtml(m.name || '未填写姓名')}</div>
                                        <div class="item-sub">${escapeHtml(m.email || '—')}</div>
                                    </td>
                                    <td><span class="pill ${st.cls}">${escapeHtml(st.label)}</span></td>
                                    <td>
                                        <div class="toolbar-group" style="gap:4px;">
                                            ${labels.length
                                                ? labels.map((l) => `<span class="pill pill-muted">${escapeHtml(typeof l === 'string' ? l : (l.name || l.slug || ''))}</span>`).join('')
                                                : '<span class="item-sub">—</span>'}
                                        </div>
                                    </td>
                                    <td>
                                        <span class="pill ${m.subscribed ? 'pill-success' : 'pill-muted'}">
                                            ${m.subscribed ? '已订阅' : '未订阅'}
                                        </span>
                                    </td>
                                    <td style="white-space:nowrap;font-size:12.5px;color:var(--muted);">
                                        ${formatDate(m.created_at)}
                                    </td>
                                    <td>
                                        <div class="row-actions">
                                            <button type="button" class="btn btn-sm" data-action="edit">编辑</button>
                                            <button type="button" class="btn btn-danger-soft btn-xs" data-action="delete">删除</button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;

            wrap.querySelectorAll('tr[data-member-id]').forEach((row) => {
                const id = row.dataset.memberId;
                const member = membersState.items.find((x) => x.id === id);
                if (!member) return;

                row.querySelector('[data-action="edit"]')?.addEventListener('click', () => openMemberModal(member));
                row.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
                    const ok = await confirmModal({
                        title: '删除会员',
                        message: `确定永久删除会员「${member.name || member.email}」吗？该操作无法撤销。`,
                        confirmText: '确认删除',
                        danger: true
                    });
                    if (!ok) return;
                    try {
                        await api.deleteMember(member.id);
                        toast('会员已删除', 'success');
                        const nextPage = membersState.items.length === 1 && membersState.page > 1
                            ? membersState.page - 1
                            : membersState.page;
                        await loadMembersPage(nextPage);
                    } catch (err) {
                        toast(`删除会员失败：${err.message}`, 'error');
                    }
                });
            });
        }

        if (footer) {
            const pages = Number(pagination.pages || 1);
            const curr = Number(pagination.page || membersState.page || 1);
            if (pages > 1) {
                footer.classList.remove('hidden');
                footer.innerHTML = `
                    <span class="field-hint">第 ${curr} / ${pages} 页（共 ${total} 条）</span>
                    <div class="toolbar-group">
                        <button type="button" class="btn btn-sm" id="mb-prev-page" ${curr <= 1 ? 'disabled' : ''}>上一页</button>
                        <button type="button" class="btn btn-sm" id="mb-next-page" ${curr >= pages ? 'disabled' : ''}>下一页</button>
                    </div>
                `;
                footer.querySelector('#mb-prev-page')?.addEventListener('click', () => loadMembersPage(curr - 1));
                footer.querySelector('#mb-next-page')?.addEventListener('click', () => loadMembersPage(curr + 1));
            } else {
                footer.classList.add('hidden');
                footer.innerHTML = '';
            }
        }
    };

    const renderMembersTab = (root) => {
        const signupAccess = settingsMap.members_signup_access || 'all';
        root.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">会员注册权限控制</h3>
                        <p class="card-desc">快速切换 Ghost 原生会员注册入口状态（即使前台隐藏了 Portal 弹窗，API 层面仍受此权限约束）</p>
                    </div>
                    <div class="toolbar-group">
                        <select id="mb-signup-access" style="width:200px;">
                            <option value="all" ${signupAccess === 'all' ? 'selected' : ''}>开放注册（all）</option>
                            <option value="invite" ${signupAccess === 'invite' ? 'selected' : ''}>仅限受邀（invite）</option>
                            <option value="none" ${signupAccess === 'none' ? 'selected' : ''}>关闭注册（none）</option>
                        </select>
                        <button type="button" class="btn btn-primary btn-sm" id="mb-save-signup-btn">保存注册权限</button>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-body" style="padding-bottom:14px;">
                    <div class="toolbar-bar" style="margin-bottom:0;">
                        <div class="toolbar-group">
                            <input type="search" id="members-search" class="search-input" placeholder="搜索会员姓名或邮箱…" value="${escapeAttr(membersState.search)}">
                            <span id="members-total-hint" class="field-hint"></span>
                        </div>
                        <div class="toolbar-group">
                            <a href="/api/admin/ghost/members/upload/?limit=all" download class="btn btn-sm">导出会员 CSV</a>
                        </div>
                    </div>
                </div>
                <div id="members-table-wrap" class="table-wrap"></div>
                <div id="members-pagination-footer" class="card-footer hidden"></div>
            </div>
        `;

        root.querySelector('#mb-save-signup-btn')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const value = root.querySelector('#mb-signup-access').value;
            btn.disabled = true;
            btn.textContent = '保存中…';
            try {
                await api.saveSettings([{ key: 'members_signup_access', value }]);
                settingsMap.members_signup_access = value;
                toast('会员注册权限已保存', 'success');
            } catch (err) {
                toast(`保存失败：${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '保存注册权限';
            }
        });

        const searchEl = root.querySelector('#members-search');
        searchEl?.addEventListener('input', (e) => {
            membersState.search = e.target.value;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                loadMembersPage(1);
            }, 300);
        });
        searchEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(searchTimer);
                membersState.search = e.target.value;
                loadMembersPage(1);
            }
        });

        renderMembersTable();
    };

    /* ==================== Tab 2: 订阅方案与优惠 ==================== */
    const openTierModal = (tier = null) => {
        const isEdit = Boolean(tier);
        const isFreeTier = isEdit && tier.type === 'free';
        const monthlyMajor = tier?.monthly_price ? (Number(tier.monthly_price) / 100).toFixed(2) : '5.00';
        const yearlyMajor = tier?.yearly_price ? (Number(tier.yearly_price) / 100).toFixed(2) : '50.00';
        const currency = (tier?.currency || 'USD').toUpperCase();

        openModal({
            title: isEdit ? `编辑订阅方案：${tier.name}` : '新建付费订阅方案',
            bodyHtml: `
                <div class="form-grid">
                    <div class="field col-span-2">
                        <label for="tr-name">方案名称 *</label>
                        <input type="text" id="tr-name" value="${escapeAttr(tier?.name || '')}" placeholder="例如：月度赞助 / 高级会员">
                    </div>
                    <div class="field col-span-2">
                        <label for="tr-desc">方案描述</label>
                        <textarea id="tr-desc" rows="2" placeholder="介绍该订阅方案包含的权益">${escapeHtml(tier?.description || '')}</textarea>
                    </div>
                    ${isFreeTier ? `
                        <div class="col-span-2">
                            <p class="field-hint">默认免费方案（Free Tier）不支持设置价格或停用，仅支持修改名称与描述。</p>
                        </div>
                    ` : `
                        <div class="field">
                            <label for="tr-currency">结算货币（ISO 代码）</label>
                            <input type="text" id="tr-currency" value="${escapeAttr(currency)}" maxlength="6" placeholder="USD / CNY">
                        </div>
                        <div class="field" style="justify-content:flex-end;">
                            <label class="check-row" style="padding-bottom:8px;">
                                <input type="checkbox" id="tr-active" ${!isEdit || tier.active !== false ? 'checked' : ''}>
                                <span>启用此订阅方案</span>
                            </label>
                        </div>
                        <div class="field">
                            <label for="tr-monthly">月付价格（元 / 标准单位）</label>
                            <input type="number" id="tr-monthly" step="0.01" min="0" value="${escapeAttr(monthlyMajor)}" placeholder="5.00">
                            <p class="field-hint">保存时自动按分（×100）换算写入 Ghost</p>
                        </div>
                        <div class="field">
                            <label for="tr-yearly">年付价格（元 / 标准单位）</label>
                            <input type="number" id="tr-yearly" step="0.01" min="0" value="${escapeAttr(yearlyMajor)}" placeholder="50.00">
                        </div>
                    `}
                </div>
            `,
            footerHtml: `
                <button type="button" class="btn" data-modal-close>取消</button>
                <button type="button" class="btn btn-primary" id="tr-save">${isEdit ? '保存修改' : '创建方案'}</button>
            `,
            onMount(dialog) {
                dialog.querySelector('#tr-save').addEventListener('click', async (e) => {
                    const name = dialog.querySelector('#tr-name').value.trim();
                    const description = dialog.querySelector('#tr-desc').value.trim();
                    if (!name) {
                        toast('请输入方案名称', 'warning');
                        dialog.querySelector('#tr-name').focus();
                        return;
                    }

                    const payload = {
                        name,
                        description: description || null
                    };

                    if (!isFreeTier) {
                        const currVal = (dialog.querySelector('#tr-currency').value.trim() || 'USD').toLowerCase();
                        const monthlyNum = Number(dialog.querySelector('#tr-monthly').value || 0);
                        const yearlyNum = Number(dialog.querySelector('#tr-yearly').value || 0);
                        const active = dialog.querySelector('#tr-active').checked;
                        if (!Number.isFinite(monthlyNum) || monthlyNum < 0 || !Number.isFinite(yearlyNum) || yearlyNum < 0) {
                            toast('请输入有效的非负价格数字', 'warning');
                            return;
                        }
                        payload.type = 'paid';
                        payload.currency = currVal;
                        payload.monthly_price = Math.round(monthlyNum * 100);
                        payload.yearly_price = Math.round(yearlyNum * 100);
                        payload.active = active;
                    }

                    const btn = e.currentTarget;
                    btn.disabled = true;
                    btn.textContent = '保存中…';
                    try {
                        if (isEdit) {
                            await api.updateTier(tier.id, payload);
                            toast('订阅方案已更新', 'success');
                        } else {
                            await api.createTier(payload);
                            toast('订阅方案已创建', 'success');
                        }
                        closeModal();
                        await reloadTiersAndOffers();
                    } catch (err) {
                        toast(`保存方案失败：${err.message}`, 'error');
                        btn.disabled = false;
                        btn.textContent = isEdit ? '保存修改' : '创建方案';
                    }
                });
            }
        });
    };

    const openCreateOfferModal = () => {
        const paidTiers = tiers.filter((t) => t.type === 'paid' && t.active !== false);
        const fallbackTiers = paidTiers.length > 0 ? paidTiers : tiers.filter((t) => t.type === 'paid');
        if (fallbackTiers.length === 0) {
            toast('请先创建一个付费订阅方案（Paid Tier），再为其创建优惠券', 'warning');
            return;
        }

        openModal({
            title: '新建订阅优惠券（Offer）',
            bodyHtml: `
                <div class="form-grid">
                    <div class="field">
                        <label for="of-name">优惠名称 *</label>
                        <input type="text" id="of-name" placeholder="例如：早鸟八折优惠">
                    </div>
                    <div class="field">
                        <label for="of-code">优惠码（Code）*</label>
                        <input type="text" id="of-code" placeholder="例如：earlybird20">
                    </div>
                    <div class="field">
                        <label for="of-tier">关联付费方案 *</label>
                        <select id="of-tier">
                            ${fallbackTiers.map((t) => `<option value="${escapeAttr(t.id)}" data-currency="${escapeAttr(t.currency || 'USD')}">${escapeHtml(t.name)} (${escapeHtml((t.currency || 'USD').toUpperCase())})</option>`).join('')}
                        </select>
                    </div>
                    <div class="field">
                        <label for="of-cadence">适用周期</label>
                        <select id="of-cadence">
                            <option value="month">月付方案（month）</option>
                            <option value="year">年付方案（year）</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="of-type">优惠类型</label>
                        <select id="of-type">
                            <option value="percent">百分比折扣（%）</option>
                            <option value="fixed">固定金额减免</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="of-amount" id="of-amount-label">折扣比例（1-100 %）*</label>
                        <input type="number" id="of-amount" min="1" step="1" value="20">
                    </div>
                    <div class="field">
                        <label for="of-duration">持续时间</label>
                        <select id="of-duration">
                            <option value="once">仅首期（once）</option>
                            <option value="repeating">连续多期（repeating）</option>
                            <option value="forever">永久有效（forever）</option>
                        </select>
                    </div>
                    <div class="field hidden" id="of-months-wrap">
                        <label for="of-months">持续月数</label>
                        <input type="number" id="of-months" min="1" step="1" value="3">
                    </div>
                </div>
            `,
            footerHtml: `
                <button type="button" class="btn" data-modal-close>取消</button>
                <button type="button" class="btn btn-primary" id="of-save">创建优惠券</button>
            `,
            onMount(dialog) {
                const typeEl = dialog.querySelector('#of-type');
                const amountLabel = dialog.querySelector('#of-amount-label');
                const amountEl = dialog.querySelector('#of-amount');
                const durEl = dialog.querySelector('#of-duration');
                const monthsWrap = dialog.querySelector('#of-months-wrap');

                typeEl.addEventListener('change', () => {
                    if (typeEl.value === 'percent') {
                        amountLabel.textContent = '折扣比例（1-100 %）*';
                        amountEl.step = '1';
                        amountEl.value = '20';
                    } else {
                        amountLabel.textContent = '减免金额（元 / 标准单位）*';
                        amountEl.step = '0.01';
                        amountEl.value = '5.00';
                    }
                });

                durEl.addEventListener('change', () => {
                    monthsWrap.classList.toggle('hidden', durEl.value !== 'repeating');
                });

                dialog.querySelector('#of-save').addEventListener('click', async (e) => {
                    const name = dialog.querySelector('#of-name').value.trim();
                    const code = dialog.querySelector('#of-code').value.trim();
                    const tierSel = dialog.querySelector('#of-tier');
                    const tierId = tierSel.value;
                    const tierCurrency = tierSel.selectedOptions[0]?.dataset.currency || 'usd';
                    const cadence = dialog.querySelector('#of-cadence').value;
                    const type = typeEl.value;
                    const rawAmount = Number(amountEl.value || 0);
                    const duration = durEl.value;
                    const durationInMonths = Number(dialog.querySelector('#of-months').value || 1);

                    if (!name || !code) {
                        toast('请填写优惠名称和优惠码', 'warning');
                        return;
                    }
                    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
                        toast('请输入有效的优惠数值', 'warning');
                        return;
                    }

                    const payload = {
                        name,
                        code,
                        display_title: name,
                        type,
                        cadence,
                        amount: type === 'percent' ? Math.round(rawAmount) : Math.round(rawAmount * 100),
                        duration,
                        tier: { id: tierId }
                    };
                    if (type === 'fixed') {
                        payload.currency = tierCurrency.toLowerCase();
                    }
                    if (duration === 'repeating') {
                        payload.duration_in_months = Math.max(1, Math.round(durationInMonths));
                    }

                    const btn = e.currentTarget;
                    btn.disabled = true;
                    btn.textContent = '创建中…';
                    try {
                        await api.createOffer(payload);
                        toast('优惠券已创建', 'success');
                        closeModal();
                        await reloadTiersAndOffers();
                    } catch (err) {
                        toast(`创建优惠券失败：${err.message}`, 'error');
                        btn.disabled = false;
                        btn.textContent = '创建优惠券';
                    }
                });
            }
        });
    };

    const renderTiersTab = (root) => {
        root.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">订阅方案（Tiers · 共 ${tiers.length} 个）</h3>
                        <p class="card-desc">管理免费与付费会员层级，设置月付/年付定价与启用状态</p>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" id="tr-add-btn">+ 新建订阅方案</button>
                </div>
                <div class="table-wrap">
                    ${tiers.length === 0 ? `
                        <div class="empty-state"><p>暂无订阅方案</p></div>
                    ` : `
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>方案名称</th>
                                    <th>类型</th>
                                    <th>状态</th>
                                    <th>月付 / 年付价格</th>
                                    <th>描述</th>
                                    <th style="text-align:right;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tiers.map((t) => {
                                    const isPaid = t.type === 'paid';
                                    const isActive = t.active !== false;
                                    const priceText = isPaid
                                        ? `${formatMinorPrice(t.monthly_price, t.currency)} / 月 · ${formatMinorPrice(t.yearly_price, t.currency)} / 年`
                                        : '免费（Free）';
                                    return `
                                        <tr data-tier-id="${escapeAttr(t.id)}">
                                            <td style="font-weight:600;">${escapeHtml(t.name)}</td>
                                            <td><span class="pill ${isPaid ? 'pill-primary' : 'pill-muted'}">${isPaid ? '付费方案' : '免费方案'}</span></td>
                                            <td><span class="pill ${isActive ? 'pill-success' : 'pill-muted'}">${isActive ? '已启用' : '已停用'}</span></td>
                                            <td style="white-space:nowrap;font-size:13px;">${escapeHtml(priceText)}</td>
                                            <td style="color:var(--muted);max-width:260px;">${escapeHtml(t.description || '—')}</td>
                                            <td>
                                                <div class="row-actions">
                                                    <button type="button" class="btn btn-sm" data-action="edit-tier">编辑</button>
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
                        <h3 class="card-title">优惠券与折扣码（Offers · 共 ${offers.length} 个）</h3>
                        <p class="card-desc">为付费订阅方案配置限时折扣码，支持百分比或固定金额减免</p>
                    </div>
                    <button type="button" class="btn btn-sm" id="of-add-btn">+ 新建优惠券</button>
                </div>
                <div class="table-wrap">
                    ${offers.length === 0 ? `
                        <div class="empty-state"><p>暂无优惠券，点击右上角「新建优惠券」创建</p></div>
                    ` : `
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>优惠名称</th>
                                    <th>优惠码</th>
                                    <th>优惠力度</th>
                                    <th>持续周期</th>
                                    <th>已兑换</th>
                                    <th>状态</th>
                                    <th style="text-align:right;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${offers.map((o) => {
                                    const isActive = o.status === 'active';
                                    return `
                                        <tr data-offer-id="${escapeAttr(o.id)}">
                                            <td style="font-weight:600;">${escapeHtml(o.name)}</td>
                                            <td><code>${escapeHtml(o.code || '—')}</code></td>
                                            <td>${escapeHtml(formatOfferAmount(o))}</td>
                                            <td>${escapeHtml(OFFER_DURATION_LABELS[o.duration] || o.duration || '—')}</td>
                                            <td><span class="pill pill-muted">${Number(o.redemption_count || 0)} 次</span></td>
                                            <td><span class="pill ${isActive ? 'pill-success' : 'pill-muted'}">${isActive ? '有效' : '已归档'}</span></td>
                                            <td>
                                                <div class="row-actions">
                                                    <button type="button" class="btn btn-ghost btn-xs" data-action="toggle-offer">
                                                        ${isActive ? '归档' : '重新启用'}
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
        `;

        root.querySelector('#tr-add-btn')?.addEventListener('click', () => openTierModal(null));
        root.querySelector('#of-add-btn')?.addEventListener('click', () => openCreateOfferModal());

        root.querySelectorAll('tr[data-tier-id]').forEach((row) => {
            const tier = tiers.find((x) => x.id === row.dataset.tierId);
            if (!tier) return;
            row.querySelector('[data-action="edit-tier"]')?.addEventListener('click', () => openTierModal(tier));
        });

        root.querySelectorAll('tr[data-offer-id]').forEach((row) => {
            const offer = offers.find((x) => x.id === row.dataset.offerId);
            if (!offer) return;
            row.querySelector('[data-action="toggle-offer"]')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                const nextStatus = offer.status === 'active' ? 'archived' : 'active';
                btn.disabled = true;
                try {
                    await api.updateOffer(offer.id, { status: nextStatus });
                    toast(nextStatus === 'active' ? '优惠券已启用' : '优惠券已归档', 'success');
                    await reloadTiersAndOffers();
                } catch (err) {
                    toast(`更新优惠券状态失败：${err.message}`, 'error');
                    btn.disabled = false;
                }
            });
        });
    };

    /* ==================== Tab 3: 邮件简报（Newsletter） ==================== */
    const openNewsletterModal = (newsletter = null) => {
        const isEdit = Boolean(newsletter);
        openModal({
            title: isEdit ? `编辑邮件简报：${newsletter.name}` : '新建邮件简报（Newsletter）',
            bodyHtml: `
                <div class="form-grid">
                    <div class="field col-span-2">
                        <label for="nl-name">简报名称 *</label>
                        <input type="text" id="nl-name" value="${escapeAttr(newsletter?.name || '')}" placeholder="例如：每周技术通讯">
                    </div>
                    <div class="field col-span-2">
                        <label for="nl-desc">简报简介</label>
                        <textarea id="nl-desc" rows="2" placeholder="向订阅者展示简报的更新频率与内容主题">${escapeHtml(newsletter?.description || '')}</textarea>
                    </div>
                    <div class="field">
                        <label for="nl-sender-name">发件人显示名称</label>
                        <input type="text" id="nl-sender-name" value="${escapeAttr(newsletter?.sender_name || '')}" placeholder="留空则使用站点标题">
                    </div>
                    <div class="field">
                        <label for="nl-sender-email">发件人邮箱（可选）</label>
                        <input type="email" id="nl-sender-email" value="${escapeAttr(newsletter?.sender_email || '')}" placeholder="newsletter@yourdomain.com">
                    </div>
                    <div class="field col-span-2">
                        <label class="check-row">
                            <input type="checkbox" id="nl-auto-sub" ${!isEdit || newsletter.subscribe_on_signup ? 'checked' : ''}>
                            <span>新会员注册时自动订阅此简报</span>
                        </label>
                    </div>
                    ${isEdit ? `
                        <div class="field col-span-2">
                            <label for="nl-status">简报状态</label>
                            <select id="nl-status">
                                <option value="active" ${newsletter.status === 'active' ? 'selected' : ''}>启用中（active）</option>
                                <option value="archived" ${newsletter.status === 'archived' ? 'selected' : ''}>已归档（archived）</option>
                            </select>
                        </div>
                    ` : ''}
                </div>
            `,
            footerHtml: `
                <button type="button" class="btn" data-modal-close>取消</button>
                <button type="button" class="btn btn-primary" id="nl-save">${isEdit ? '保存修改' : '创建简报'}</button>
            `,
            onMount(dialog) {
                dialog.querySelector('#nl-save').addEventListener('click', async (e) => {
                    const name = dialog.querySelector('#nl-name').value.trim();
                    const description = dialog.querySelector('#nl-desc').value.trim();
                    const senderName = dialog.querySelector('#nl-sender-name').value.trim();
                    const senderEmail = dialog.querySelector('#nl-sender-email').value.trim();
                    const subscribeOnSignup = dialog.querySelector('#nl-auto-sub').checked;
                    const statusEl = dialog.querySelector('#nl-status');

                    if (!name) {
                        toast('请输入简报名称', 'warning');
                        dialog.querySelector('#nl-name').focus();
                        return;
                    }

                    const payload = {
                        name,
                        description: description || null,
                        sender_name: senderName || null,
                        sender_email: senderEmail || null,
                        subscribe_on_signup: subscribeOnSignup
                    };
                    if (isEdit && statusEl) {
                        payload.status = statusEl.value;
                    }

                    const btn = e.currentTarget;
                    btn.disabled = true;
                    btn.textContent = '保存中…';
                    try {
                        if (isEdit) {
                            await api.updateNewsletter(newsletter.id, payload);
                            toast('邮件简报设置已更新', 'success');
                        } else {
                            await api.createNewsletter(payload);
                            toast('邮件简报已创建', 'success');
                        }
                        closeModal();
                        await reloadNewsletters();
                    } catch (err) {
                        toast(`保存简报失败：${err.message}`, 'error');
                        btn.disabled = false;
                        btn.textContent = isEdit ? '保存修改' : '创建简报';
                    }
                });
            }
        });
    };

    const renderNewslettersTab = (root) => {
        root.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">邮件简报（Newsletters · 共 ${newsletters.length} 个）</h3>
                        <p class="card-desc">管理站点多栏目邮件通讯、发件人信息及新会员默认订阅策略</p>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" id="nl-add-btn">+ 新建简报</button>
                </div>
                <div class="table-wrap">
                    ${newsletters.length === 0 ? `
                        <div class="empty-state"><p>暂无邮件简报</p></div>
                    ` : `
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>简报名称</th>
                                    <th>状态</th>
                                    <th>发件人信息</th>
                                    <th>注册默认订阅</th>
                                    <th style="text-align:right;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${newsletters.map((n) => {
                                    const isActive = n.status === 'active';
                                    return `
                                        <tr data-nl-id="${escapeAttr(n.id)}">
                                            <td>
                                                <div style="font-weight:600;color:var(--ink);">${escapeHtml(n.name)}</div>
                                                <div class="item-sub">${escapeHtml(n.description || '—')}</div>
                                            </td>
                                            <td>
                                                <span class="pill ${isActive ? 'pill-success' : 'pill-muted'}">
                                                    ${isActive ? '启用中' : '已归档'}
                                                </span>
                                            </td>
                                            <td style="font-size:13px;">
                                                <div>${escapeHtml(n.sender_name || '默认站点标题')}</div>
                                                <div class="item-sub">${escapeHtml(n.sender_email || '默认系统发件邮箱')}</div>
                                            </td>
                                            <td>
                                                <span class="pill ${n.subscribe_on_signup ? 'pill-primary' : 'pill-muted'}">
                                                    ${n.subscribe_on_signup ? '自动订阅' : '手动订阅'}
                                                </span>
                                            </td>
                                            <td>
                                                <div class="row-actions">
                                                    <button type="button" class="btn btn-ghost btn-xs" data-action="toggle-nl">
                                                        ${isActive ? '归档' : '启用'}
                                                    </button>
                                                    <button type="button" class="btn btn-sm" data-action="edit-nl">编辑</button>
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

        root.querySelector('#nl-add-btn')?.addEventListener('click', () => openNewsletterModal(null));
        root.querySelectorAll('tr[data-nl-id]').forEach((row) => {
            const nl = newsletters.find((x) => x.id === row.dataset.nlId);
            if (!nl) return;

            row.querySelector('[data-action="edit-nl"]')?.addEventListener('click', () => openNewsletterModal(nl));
            row.querySelector('[data-action="toggle-nl"]')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                const nextStatus = nl.status === 'active' ? 'archived' : 'active';
                btn.disabled = true;
                try {
                    await api.updateNewsletter(nl.id, { status: nextStatus });
                    toast(nextStatus === 'active' ? '邮件简报已启用' : '邮件简报已归档', 'success');
                    await reloadNewsletters();
                } catch (err) {
                    toast(`切换状态失败：${err.message}`, 'error');
                    btn.disabled = false;
                }
            });
        });
    };

    const renderActiveTab = () => {
        const body = container.querySelector('#members-tab-body');
        if (!body) return;
        if (activeTab === 'members') renderMembersTab(body);
        else if (activeTab === 'tiers') renderTiersTab(body);
        else renderNewslettersTab(body);
    };

    const renderShell = () => {
        container.innerHTML = `
            <div class="hint-banner">
                <div>
                    <strong>功能说明：</strong>当前博客前台主题已关闭 Ghost Portal 会员弹窗，访客端不会显示登录/订阅浮层；此处直接管理 Ghost 原生会员、订阅方案与邮件简报后端数据，可随时在此开启或扩展会员功能。
                </div>
            </div>
            <div style="margin-bottom:18px;">
                <div class="tabs" id="members-tabs">
                    <button type="button" class="tab-btn ${activeTab === 'members' ? 'active' : ''}" data-tab="members">会员列表</button>
                    <button type="button" class="tab-btn ${activeTab === 'tiers' ? 'active' : ''}" data-tab="tiers">订阅方案与优惠</button>
                    <button type="button" class="tab-btn ${activeTab === 'newsletters' ? 'active' : ''}" data-tab="newsletters">邮件简报（Newsletter）</button>
                </div>
            </div>
            <div id="members-tab-body"></div>
        `;

        container.querySelector('#members-tabs').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-tab]');
            if (!btn) return;
            activeTab = btn.dataset.tab;
            container.querySelectorAll('#members-tabs .tab-btn').forEach((b) => {
                b.classList.toggle('active', b.dataset.tab === activeTab);
            });
            renderActiveTab();
        });

        renderActiveTab();
    };

    renderShell();
}
