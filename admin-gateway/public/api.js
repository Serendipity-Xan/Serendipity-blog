let unauthorizedHandler = null;
let mutationHandler = null;

export function setUnauthorizedHandler(fn) {
    unauthorizedHandler = fn;
}

export function setMutationHandler(fn) {
    mutationHandler = fn;
}

function translateGhostMessage(msg, context) {
    const raw = [msg, context].filter(Boolean).join(' · ');
    if (!raw) return '请求失败，请稍后重试';
    if (/Update collision|updated_at/i.test(raw)) {
        return '保存冲突：内容已被其他窗口修改，请刷新后重试';
    }
    if (/Validation error/i.test(raw)) {
        return `字段校验未通过：${context || msg}`;
    }
    if (/not found/i.test(raw)) {
        return '目标内容不存在或已被删除';
    }
    if (/Access denied|Unauthorized/i.test(raw)) {
        return '登录会话已失效，请重新登录';
    }
    if (/too many/i.test(raw)) {
        return '操作过于频繁，请稍后再试';
    }
    return context ? `${msg}（${context}）` : msg;
}

async function extractError(res) {
    const text = await res.text().catch(() => '');
    if (!text) return `请求失败（HTTP ${res.status}）`;
    try {
        const json = JSON.parse(text);
        if (json.error) {
            return json.detail ? `${json.error}：${json.detail}` : json.error;
        }
        if (Array.isArray(json.errors) && json.errors[0]) {
            return translateGhostMessage(json.errors[0].message, json.errors[0].context);
        }
    } catch {
        // plain text fallback
    }
    return text.slice(0, 180);
}

export async function request(url, { method = 'GET', body = null, headers = {}, skipAuthRedirect = false } = {}) {
    const reqHeaders = { Accept: 'application/json', ...headers };
    let payload = body;

    if (body !== null && !(body instanceof FormData) && typeof body !== 'string') {
        reqHeaders['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }

    const res = await fetch(url, {
        method,
        headers: reqHeaders,
        body: payload,
        credentials: 'same-origin'
    });

    if (res.status === 401 && !skipAuthRedirect) {
        if (typeof unauthorizedHandler === 'function') {
            unauthorizedHandler();
        }
        throw new Error('登录状态已过期，请重新登录');
    }

    if (!res.ok) {
        const message = await extractError(res);
        const err = new Error(message);
        err.status = res.status;
        throw err;
    }

    if (method !== 'GET' && method !== 'HEAD') mutationHandler?.();
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
        return res.json();
    }
    return res.text();
}

export const api = {
    // 认证
    getMe: () => request('/api/admin/me', { skipAuthRedirect: true }),
    login: (username, password) =>
        request('/api/admin/login', {
            method: 'POST',
            body: { username, password },
            skipAuthRedirect: true
        }),
    logout: () => request('/api/admin/logout', { method: 'POST', skipAuthRedirect: true }),

    // 站点自定义配置 (data/site-config.json)
    getAdminBrand: () => request('/api/admin-brand', { skipAuthRedirect: true }),
    getSiteConfig: () => request('/api/admin/site-config'),
    saveSiteConfig: (config) => request('/api/admin/site-config', { method: 'PUT', body: config }),
    patchSiteConfig: (partial) => request('/api/admin/site-config', { method: 'PATCH', body: partial }),

    // 媒体图库
    getMedia: () => request('/api/admin/media'),
    uploadImage: async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('purpose', 'image');
        const data = await request('/api/admin/ghost/images/upload/', {
            method: 'POST',
            body: fd
        });
        const img = data?.images?.[0];
        if (!img?.url) throw new Error('图片上传成功但未返回地址');
        // 将同源或 /content/images/ 地址转为相对路径，便于局域网访问、迁移与预览
        try {
            const parsed = new URL(img.url, window.location.origin);
            if (parsed.pathname.startsWith('/content/images/') || parsed.origin === window.location.origin) {
                return { ...img, url: parsed.pathname };
            }
        } catch {}
        return img;
    },

    // 文章 (Ghost Posts)
    listPosts: async () => {
        const query = new URLSearchParams({
            limit: '100',
            include: 'tags,authors',
            fields: 'id,title,slug,status,published_at,updated_at,featured,visibility,feature_image,custom_excerpt,url',
            order: 'updated_at desc, id desc'
        });
        const posts = [];
        let page = 1;
        while (page) {
            query.set('page', String(page));
            const data = await request(`/api/admin/ghost/posts/?${query}`);
            posts.push(...(data?.posts || []));
            page = data?.meta?.pagination?.next;
        }
        return posts;
    },
    getPost: async (id) => {
        const data = await request(`/api/admin/ghost/posts/${encodeURIComponent(id)}/?include=tags,authors&formats=html,lexical`);
        return data?.posts?.[0] || null;
    },
    createPost: async (post) => {
        const qs = Object.prototype.hasOwnProperty.call(post, 'html') ? '?source=html' : '';
        const data = await request(`/api/admin/ghost/posts/${qs}`, {
            method: 'POST',
            body: { posts: [post] }
        });
        return data?.posts?.[0] || null;
    },
    updatePost: async (id, post) => {
        const qs = Object.prototype.hasOwnProperty.call(post, 'html') ? '?source=html' : '';
        const data = await request(`/api/admin/ghost/posts/${encodeURIComponent(id)}/${qs}`, {
            method: 'PUT',
            body: { posts: [post] }
        });
        return data?.posts?.[0] || null;
    },
    deletePost: (id) =>
        request(`/api/admin/ghost/posts/${encodeURIComponent(id)}/`, { method: 'DELETE' }),

    // 独立页面 (Ghost Pages)
    listPages: async () => {
        const data = await request('/api/admin/ghost/pages/?limit=all&include=tags,authors&formats=html,lexical&order=updated_at%20desc');
        return data?.pages || [];
    },
    getPage: async (id) => {
        const data = await request(`/api/admin/ghost/pages/${encodeURIComponent(id)}/?include=tags,authors&formats=html,lexical`);
        return data?.pages?.[0] || null;
    },
    createPage: async (page) => {
        const qs = Object.prototype.hasOwnProperty.call(page, 'html') ? '?source=html' : '';
        const data = await request(`/api/admin/ghost/pages/${qs}`, {
            method: 'POST',
            body: { pages: [page] }
        });
        return data?.pages?.[0] || null;
    },
    updatePage: async (id, page) => {
        const qs = Object.prototype.hasOwnProperty.call(page, 'html') ? '?source=html' : '';
        const data = await request(`/api/admin/ghost/pages/${encodeURIComponent(id)}/${qs}`, {
            method: 'PUT',
            body: { pages: [page] }
        });
        return data?.pages?.[0] || null;
    },
    deletePage: (id) =>
        request(`/api/admin/ghost/pages/${encodeURIComponent(id)}/`, { method: 'DELETE' }),

    // 标签 (Ghost Tags)
    listTags: async () => {
        const tags = [];
        let page = 1;
        while (page) {
            const data = await request(`/api/admin/ghost/tags/?limit=100&include=count.posts&page=${page}`);
            tags.push(...(data?.tags || []));
            page = data?.meta?.pagination?.next;
        }
        return tags;
    },
    createTag: async (tag) => {
        const data = await request('/api/admin/ghost/tags/', {
            method: 'POST',
            body: { tags: [tag] }
        });
        return data?.tags?.[0] || null;
    },
    updateTag: async (id, tag) => {
        const data = await request(`/api/admin/ghost/tags/${encodeURIComponent(id)}/`, {
            method: 'PUT',
            body: { tags: [tag] }
        });
        return data?.tags?.[0] || null;
    },
    deleteTag: (id) =>
        request(`/api/admin/ghost/tags/${encodeURIComponent(id)}/`, { method: 'DELETE' }),

    // 站点基础设置 (Ghost Settings)
    getSettings: async () => {
        const data = await request('/api/admin/ghost/settings/');
        return data?.settings || [];
    },
    saveSettings: async (settingsList) => {
        const data = await request('/api/admin/ghost/settings/', {
            method: 'PUT',
            body: { settings: settingsList }
        });
        return data?.settings || [];
    },

    // 主题自定义设置 (Ghost Custom Theme Settings)
    getCustomThemeSettings: async () => {
        const data = await request('/api/admin/ghost/custom_theme_settings/');
        return data?.custom_theme_settings || [];
    },
    saveCustomThemeSettings: async (items) => {
        const payload = items.map(({ id, key, value }) => ({ id, key, value }));
        const data = await request('/api/admin/ghost/custom_theme_settings/', {
            method: 'PUT',
            body: { custom_theme_settings: payload }
        });
        return data?.custom_theme_settings || [];
    },

    // 当前站长资料与团队管理
    getCurrentUser: async () => {
        const data = await request('/api/admin/ghost/users/me/?include=roles');
        return data?.users?.[0] || null;
    },
    updateUser: async (id, user) => {
        const data = await request(`/api/admin/ghost/users/${encodeURIComponent(id)}/`, {
            method: 'PUT',
            body: { users: [user] }
        });
        return data?.users?.[0] || null;
    },
    listUsers: async () => {
        const data = await request('/api/admin/ghost/users/?limit=all&include=roles');
        return data?.users || [];
    },
    listRoles: async () => {
        const data = await request('/api/admin/ghost/roles/?limit=all');
        return data?.roles || [];
    },
    listInvites: async () => {
        const data = await request('/api/admin/ghost/invites/?limit=all');
        return data?.invites || [];
    },
    createInvite: async (invite) => {
        const data = await request('/api/admin/ghost/invites/', {
            method: 'POST',
            body: { invites: [invite] }
        });
        return data?.invites?.[0] || null;
    },
    deleteInvite: (id) =>
        request(`/api/admin/ghost/invites/${encodeURIComponent(id)}/`, { method: 'DELETE' }),
    changePassword: (userId, oldPassword, newPassword, ne2Password) =>
        request('/api/admin/ghost/users/password/', {
            method: 'PUT',
            body: {
                password: [
                    {
                        user_id: userId,
                        oldPassword,
                        newPassword,
                        ne2Password
                    }
                ]
            }
        }),

    // 会员与订阅 (Ghost Members / Tiers / Offers / Newsletters)
    listMembers: async (page = 1, limit = 30, search = '') => {
        const params = new URLSearchParams({
            page: String(page),
            limit: String(limit),
            include: 'labels,tiers',
            order: 'created_at desc'
        });
        if (search && String(search).trim()) {
            params.set('search', String(search).trim());
        }
        const data = await request(`/api/admin/ghost/members/?${params.toString()}`);
        return {
            members: data?.members || [],
            meta: data?.meta || {},
            pagination: data?.meta?.pagination || null
        };
    },
    createMember: async (member) => {
        const data = await request('/api/admin/ghost/members/', {
            method: 'POST',
            body: { members: [member] }
        });
        return data?.members?.[0] || null;
    },
    updateMember: async (id, member) => {
        const data = await request(`/api/admin/ghost/members/${encodeURIComponent(id)}/`, {
            method: 'PUT',
            body: { members: [member] }
        });
        return data?.members?.[0] || null;
    },
    deleteMember: (id) =>
        request(`/api/admin/ghost/members/${encodeURIComponent(id)}/`, { method: 'DELETE' }),

    listTiers: async () => {
        const data = await request('/api/admin/ghost/tiers/?limit=all');
        return data?.tiers || [];
    },
    createTier: async (tier) => {
        const data = await request('/api/admin/ghost/tiers/', {
            method: 'POST',
            body: { tiers: [tier] }
        });
        return data?.tiers?.[0] || null;
    },
    updateTier: async (id, tier) => {
        const data = await request(`/api/admin/ghost/tiers/${encodeURIComponent(id)}/`, {
            method: 'PUT',
            body: { tiers: [tier] }
        });
        return data?.tiers?.[0] || null;
    },

    listOffers: async () => {
        const data = await request('/api/admin/ghost/offers/?limit=all');
        return data?.offers || [];
    },
    createOffer: async (offer) => {
        const data = await request('/api/admin/ghost/offers/', {
            method: 'POST',
            body: { offers: [offer] }
        });
        return data?.offers?.[0] || null;
    },
    updateOffer: async (id, offer) => {
        const data = await request(`/api/admin/ghost/offers/${encodeURIComponent(id)}/`, {
            method: 'PUT',
            body: { offers: [offer] }
        });
        return data?.offers?.[0] || null;
    },

    listNewsletters: async () => {
        const data = await request('/api/admin/ghost/newsletters/?limit=all&include=count.posts,count.members');
        return data?.newsletters || [];
    },
    createNewsletter: async (nl) => {
        const data = await request('/api/admin/ghost/newsletters/', {
            method: 'POST',
            body: { newsletters: [nl] }
        });
        return data?.newsletters?.[0] || null;
    },
    updateNewsletter: async (id, nl) => {
        const data = await request(`/api/admin/ghost/newsletters/${encodeURIComponent(id)}/`, {
            method: 'PUT',
            body: { newsletters: [nl] }
        });
        return data?.newsletters?.[0] || null;
    },

    // 评论管理 (Ghost Comments)
    listComments: async (page = 1, limit = 30) => {
        const params = new URLSearchParams({
            page: String(page),
            limit: String(limit),
            order: 'created_at desc'
        });
        const data = await request(`/api/admin/ghost/comments/?${params.toString()}`);
        return {
            comments: data?.comments || [],
            meta: data?.meta || {},
            pagination: data?.meta?.pagination || null
        };
    },
    updateCommentStatus: async (id, status) => {
        const data = await request(`/api/admin/ghost/comments/${encodeURIComponent(id)}/`, {
            method: 'PUT',
            body: { comments: [{ status }] }
        });
        return data?.comments?.[0] || null;
    },

    // 主题管理 (Ghost Themes)
    listThemes: async () => {
        const data = await request('/api/admin/ghost/themes/');
        return data?.themes || [];
    },
    activateTheme: async (name) => {
        const data = await request(`/api/admin/ghost/themes/${encodeURIComponent(name)}/activate/`, {
            method: 'PUT'
        });
        return data?.themes?.[0] || null;
    },
    deleteTheme: (name) =>
        request(`/api/admin/ghost/themes/${encodeURIComponent(name)}/`, { method: 'DELETE' }),
    uploadThemeZip: async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        const data = await request('/api/admin/ghost/themes/upload/', {
            method: 'POST',
            body: fd
        });
        return data?.themes?.[0] || null;
    },

    // 路由配置 (routes.yaml)
    getRoutesYaml: () =>
        request('/api/admin/ghost/settings/routes/yaml/', {
            headers: { Accept: 'text/yaml, text/plain, */*' }
        }),
    uploadRoutesYaml: (yamlText) => {
        const fd = new FormData();
        fd.append('routes', new Blob([yamlText], { type: 'text/yaml' }), 'routes.yaml');
        return request('/api/admin/ghost/settings/routes/yaml/', {
            method: 'POST',
            body: fd
        });
    },

    // 自定义集成与 Webhook (Integrations & Webhooks)
    listIntegrations: async () => {
        const data = await request('/api/admin/ghost/integrations/?limit=all&include=api_keys,webhooks');
        return data?.integrations || [];
    },
    createIntegration: async (data) => {
        const res = await request('/api/admin/ghost/integrations/', {
            method: 'POST',
            body: { integrations: [data] }
        });
        return res?.integrations?.[0] || null;
    },
    updateIntegration: async (id, data) => {
        const res = await request(`/api/admin/ghost/integrations/${encodeURIComponent(id)}/`, {
            method: 'PUT',
            body: { integrations: [data] }
        });
        return res?.integrations?.[0] || null;
    },
    deleteIntegration: (id) =>
        request(`/api/admin/ghost/integrations/${encodeURIComponent(id)}/`, { method: 'DELETE' }),
    createWebhook: async (data) => {
        const res = await request('/api/admin/ghost/webhooks/', {
            method: 'POST',
            body: { webhooks: [data] }
        });
        return res?.webhooks?.[0] || null;
    },
    deleteWebhook: (id) =>
        request(`/api/admin/ghost/webhooks/${encodeURIComponent(id)}/`, { method: 'DELETE' }),

    // 数据库内容导入 (Ghost DB Import)
    importDb: (file) => {
        const fd = new FormData();
        fd.append('importfile', file);
        return request('/api/admin/ghost/db/', {
            method: 'POST',
            body: fd
        });
    }
};
