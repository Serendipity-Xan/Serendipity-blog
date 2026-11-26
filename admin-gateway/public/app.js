import { api, setMutationHandler, setUnauthorizedHandler } from './api.js';
import { renderIconSvg, toast } from './utils.js';
import { applyI18nToSubtree, getLang, setLang, startI18nObserver, translateText } from './i18n.js';
import { renderEditorView } from './components/editor.js';
import { renderDashboardView } from './views/dashboard.js';
import { renderPostsView } from './views/posts.js';
import { renderTagsView } from './views/tags.js';
import { renderPagesView } from './views/pages.js';
import { renderHomeView } from './views/home.js';
import { renderLinksView } from './views/links.js';
import { renderSectionsView } from './views/sections.js';
import { renderAppearanceView } from './views/appearance.js';
import { renderSettingsView } from './views/settings.js';
import { renderMediaView } from './views/media.js';
import { renderMembersView } from './views/members.js';
import { renderCommentsView } from './views/comments.js';
import { renderAdvancedView } from './views/advanced.js';

const NAV_GROUPS = [
    {
        label: '内容管理',
        items: [
            { id: 'dashboard', label: '工作台概览', icon: 'dashboard' },
            { id: 'posts', label: '文章管理', icon: 'posts' },
            { id: 'tags', label: '文章标签', icon: 'sections' },
            { id: 'pages', label: '独立页面', icon: 'pages' },
            { id: 'media', label: '媒体图库', icon: 'media' }
        ]
    },
    {
        label: '页面与外观装修',
        items: [
            { id: 'home', label: '首页装修', icon: 'home' },
            { id: 'links', label: '友链管理', icon: 'links' },
            { id: 'sections', label: '栏目与展示规则', icon: 'sections' },
            { id: 'appearance', label: '外观与壁纸库', icon: 'appearance' }
        ]
    },
    {
        label: '互动与会员生态',
        items: [
            { id: 'members', label: '会员与订阅', icon: 'members' },
            { id: 'comments', label: '评论管理', icon: 'comments' }
        ]
    },
    {
        label: '系统与扩展',
        items: [
            { id: 'settings', label: '站点与站长设置', icon: 'settings' },
            { id: 'advanced', label: '高级扩展与运维', icon: 'advanced' }
        ]
    }
];

const bootScreen = document.getElementById('boot-screen');
const loginScreen = document.getElementById('login-screen');
const appShell = document.getElementById('app-shell');
const sidebarEl = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const sidebarNav = document.getElementById('sidebar-nav');
let viewRoot = document.getElementById('view-root');
const pageTitleEl = document.getElementById('page-title');
const pageSubtitleEl = document.getElementById('page-subtitle');
let topbarActionsEl = document.getElementById('topbar-actions');
const viewTemplate = viewRoot.cloneNode(false);
const actionsTemplate = topbarActionsEl.cloneNode(false);
const cachedViews = new Map();
let activeView = null;
const themeButtons = document.querySelectorAll('[data-admin-theme-toggle]');
const langButtons = document.querySelectorAll('[data-admin-lang-toggle]');

function updateLangButtons() {
    const isEn = getLang() === 'en';
    for (const button of langButtons) {
        button.textContent = isEn ? '中文' : 'EN';
        button.title = isEn ? '切换为中文' : 'Switch to English';
        button.setAttribute('aria-label', button.title);
    }
}

for (const button of langButtons) {
    button.addEventListener('click', () => {
        const nextLang = getLang() === 'en' ? 'zh-CN' : 'en';
        setLang(nextLang);
        updateLangButtons();
        buildSidebar();
        applyAdminBrand(adminBrand);
        applyI18nToSubtree(document.body);
        cachedViews.clear();
        if (currentUser) {
            activeView = null;
            renderCurrentRoute();
        }
    });
}
updateLangButtons();

function setAdminTheme(theme) {
    document.documentElement.dataset.adminTheme = theme;
    const dark = theme === 'dark';
    for (const button of themeButtons) {
        button.setAttribute('aria-pressed', String(dark));
        button.title = translateText(dark ? '切换到白天模式' : '切换到夜间模式');
        button.firstElementChild.textContent = dark ? '☀' : '☾';
    }
}

for (const button of themeButtons) {
    button.addEventListener('click', () => {
        const theme = document.documentElement.dataset.adminTheme === 'dark' ? 'light' : 'dark';
        setAdminTheme(theme);
        try { localStorage.setItem('ag-admin-theme-v1', theme); } catch {}
    });
}
setAdminTheme(document.documentElement.dataset.adminTheme || 'light');

let currentUser = null;
let sessionRevision = 0;
let pendingRouteOptions = null;
let currentTitle = '工作台概览';
let adminBrand = {
    title: 'Serendipity',
    subtitle: '中文管理台',
    loginSubtitle: '中文内容与外观控制中心',
    brandMark: 'S'
};

function applyAdminBrand(brand) {
    if (!brand || typeof brand !== 'object') return;
    adminBrand = {
        title: String(brand.title ?? adminBrand.title).trim() || 'Serendipity',
        subtitle: brand.subtitle !== undefined ? String(brand.subtitle).trim() : adminBrand.subtitle,
        loginSubtitle: String(brand.loginSubtitle ?? adminBrand.loginSubtitle).trim() || '中文内容与外观控制中心',
        brandMark: String(brand.brandMark ?? adminBrand.brandMark).trim().slice(0, 2) || 'S'
    };
    const setEl = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    setEl('login-brand-mark', adminBrand.brandMark);
    setEl('login-brand-title', translateText(`${adminBrand.title} · 管理台`));
    setEl('login-brand-sub', translateText(adminBrand.loginSubtitle));
    setEl('sidebar-brand-mark', adminBrand.brandMark);
    setEl('sidebar-brand-title', adminBrand.title);
    setEl('sidebar-brand-sub', translateText(adminBrand.subtitle));
    const docSub = translateText(adminBrand.subtitle);
    document.title = `${translateText(currentTitle)} · ${adminBrand.title}${docSub ? ' ' + docSub : ''}`;
}

function closeMobileSidebar() {
    sidebarEl.classList.remove('open');
    sidebarBackdrop.classList.add('hidden');
}

function openMobileSidebar() {
    sidebarEl.classList.add('open');
    sidebarBackdrop.classList.remove('hidden');
}

function buildSidebar() {
    sidebarNav.innerHTML = NAV_GROUPS.map((group) => `
        <div class="nav-group-label">${group.label}</div>
        ${group.items.map((item) => `
            <a href="#${item.id}" class="nav-item" data-nav-id="${item.id}">
                ${renderIconSvg(item.icon)}
                <span>${item.label}</span>
            </a>
        `).join('')}
    `).join('');

    sidebarNav.querySelectorAll('.nav-item').forEach((link) => {
        link.addEventListener('click', () => closeMobileSidebar());
    });
}

function highlightNav(routeBase) {
    sidebarNav.querySelectorAll('.nav-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.navId === routeBase);
    });
}

function updateUserDisplay(user) {
    currentUser = user;
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    const fallbackEl = document.getElementById('user-avatar-fallback');
    const name = user?.name || user?.email || '站长';
    if (nameEl) nameEl.textContent = name;
    if (user?.profile_image && avatarEl && fallbackEl) {
        avatarEl.src = user.profile_image;
        avatarEl.classList.remove('hidden');
        fallbackEl.classList.add('hidden');
    } else if (avatarEl && fallbackEl) {
        avatarEl.classList.add('hidden');
        fallbackEl.classList.remove('hidden');
        fallbackEl.textContent = name.slice(0, 1).toUpperCase();
    }
}

function showLogin(showExpiredToast = false) {
    currentUser = null;
    sessionRevision += 1;
    cachedViews.clear();
    activeView = null;
    pendingRouteOptions = null;
    mountViewNodes(viewTemplate.cloneNode(false), actionsTemplate.cloneNode(false));
    bootScreen.classList.add('hidden');
    appShell.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    if (showExpiredToast) {
        toast('登录状态已过期，请重新登录', 'warning');
    }
    setTimeout(() => document.getElementById('login-email')?.focus(), 50);
}

function showApp(user) {
    updateUserDisplay(user);
    bootScreen.classList.add('hidden');
    loginScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    renderCurrentRoute();
}

const renderers = new Map(Object.entries({
    dashboard: renderDashboardView,
    posts: renderPostsView,
    tags: renderTagsView,
    pages: renderPagesView,
    home: renderHomeView,
    links: renderLinksView,
    sections: renderSectionsView,
    appearance: renderAppearanceView,
    settings: renderSettingsView,
    media: renderMediaView,
    members: renderMembersView,
    comments: renderCommentsView,
    advanced: renderAdvancedView
}));

function mountViewNodes(root, actions) {
    viewRoot.replaceWith(root);
    topbarActionsEl.replaceWith(actions);
    viewRoot = root;
    topbarActionsEl = actions;
}

function renderTopbar(view) {
    currentTitle = view.title || adminBrand.title;
    pageTitleEl.textContent = translateText(currentTitle);
    pageSubtitleEl.textContent = translateText(view.subtitle);
    const docSub = translateText(adminBrand.subtitle);
    document.title = `${translateText(currentTitle)} · ${adminBrand.title}${docSub ? ' ' + docSub : ''}`;
}

function activateView(view) {
    if (activeView === view) return;
    if (activeView) activeView.scrollY = window.scrollY;
    activeView = view;
    mountViewNodes(view.root, view.actions);
    highlightNav(view.section);
    renderTopbar(view);
    window.scrollTo(0, view.scrollY);
}

function navigate(hashPath, options = null) {
    pendingRouteOptions = options;
    const normalized = hashPath.startsWith('#') ? hashPath : `#${hashPath}`;
    if (window.location.hash === normalized) renderCurrentRoute();
    else window.location.hash = normalized;
}

function createViewContext(view) {
    const session = sessionRevision;
    return {
        getUser: () => currentUser,
        updateUserDisplay(user) {
            if (session === sessionRevision && currentUser) updateUserDisplay(user);
        },
        applyAdminBrand(brand) {
            if (session === sessionRevision && currentUser) applyAdminBrand(brand);
        },
        getAdminBrand: () => ({ ...adminBrand }),
        setTopbar(title, subtitle = '', actionsHtml = '') {
            view.title = title;
            view.subtitle = subtitle;
            view.actions.innerHTML = actionsHtml;
            if (activeView === view) renderTopbar(view);
        },
        getTopbarAction(id) {
            return view.actions.querySelector(`#${id}`);
        },
        navigate(hashPath, options) {
            if (activeView === view) navigate(hashPath, options);
        }
    };
}

async function renderCurrentRoute() {
    if (!currentUser) return;

    const [path] = (window.location.hash || '#dashboard').slice(1).split('?');
    const [requested, action, encodedId] = path.split('/').filter(Boolean);
    const section = renderers.has(requested) ? requested : 'dashboard';
    const editing = (section === 'posts' || section === 'pages') && (action === 'new' || action === 'edit');
    const options = pendingRouteOptions;
    pendingRouteOptions = null;

    const cached = !editing && !options ? cachedViews.get(section) : null;
    if (cached) {
        activateView(cached);
        return;
    }

    const view = { section, title: '', subtitle: '', scrollY: 0,
        root: viewTemplate.cloneNode(false), actions: actionsTemplate.cloneNode(false) };
    if (!editing) cachedViews.set(section, view);
    const ctx = createViewContext(view);
    activateView(view);

    try {
        if (editing) {
            await renderEditorView(view.root, ctx, {
                kind: section === 'posts' ? 'post' : 'page',
                id: action === 'edit' && encodedId ? decodeURIComponent(encodedId) : null,
                onBack: () => ctx.navigate(section)
            });
        } else {
            await renderers.get(section)(view.root, ctx, options || {});
        }
    } catch (error) {
        const notice = document.createElement('div');
        notice.className = 'form-error';
        notice.textContent = error.message || '页面加载失败，请刷新后重试';
        view.root.replaceChildren(notice);
    }
    if (view.root.querySelector(':scope > .form-error') && cachedViews.get(section) === view) {
        cachedViews.delete(section);
    }
}

// 登录表单提交
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginSubmit = document.getElementById('login-submit');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const username = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!username || !password) {
        loginError.textContent = '请填写管理员邮箱和密码';
        loginError.classList.remove('hidden');
        return;
    }

    loginSubmit.disabled = true;
    loginSubmit.textContent = translateText('正在登录…');

    try {
        const res = await api.login(username, password);
        const user = res?.user || (await api.getMe())?.user;
        document.getElementById('login-password').value = '';
        toast(`欢迎回到 ${adminBrand.title}`, 'success');
        showApp(user || { name: username });
    } catch (err) {
        loginError.textContent = translateText(err.message || '登录失败，请检查账号和密码');
        loginError.classList.remove('hidden');
    } finally {
        loginSubmit.disabled = false;
        loginSubmit.textContent = translateText('登录管理台');
    }
});

// 退出登录
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await api.logout();
    } catch {}
    toast('已退出管理台', 'info');
    showLogin(false);
});

// 移动端侧边栏开关
document.getElementById('sidebar-open-btn').addEventListener('click', openMobileSidebar);
document.getElementById('sidebar-close-btn').addEventListener('click', closeMobileSidebar);
sidebarBackdrop.addEventListener('click', closeMobileSidebar);

// 路由监听 & 401 全局回调
window.addEventListener('hashchange', () => {
    if (currentUser) renderCurrentRoute();
});

// Browsed pages keep their rendered state until data changes or the browser is refreshed.
setMutationHandler(() => cachedViews.clear());

setUnauthorizedHandler(() => {
    if (currentUser) showLogin(true);
});

// 启动初始化
async function bootstrap() {
    startI18nObserver();
    buildSidebar();
    try {
        const [brand, data] = await Promise.all([
            api.getAdminBrand().catch(() => null),
            api.getMe().catch(() => null)
        ]);
        if (brand) {
            applyAdminBrand(brand);
        }
        if (data?.user) {
            showApp(data.user);
        } else {
            showLogin(false);
        }
    } catch {
        showLogin(false);
    }
}

bootstrap();
