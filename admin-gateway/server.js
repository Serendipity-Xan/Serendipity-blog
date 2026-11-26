'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 8082);
const GHOST_URL = new URL(process.env.GHOST_INTERNAL_URL || 'http://ghost:2368');
const PUBLIC_URL = new URL(process.env.PUBLIC_URL || 'http://localhost:8082');
const DATA_DIR = process.env.DATA_DIR || '/data';
const CONFIG_PATH = path.join(DATA_DIR, 'site-config.json');
const EXAMPLE_CONFIG_PATH = path.join(DATA_DIR, 'site-config.example.json');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const PUBLIC_DIR = path.join(__dirname, 'public');
const CONTENT_KEY = (process.env.GHOST_CONTENT_KEY || '').trim();

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

const DEFAULT_CONFIG = {
    admin: {
        title: 'Serendipity',
        subtitle: '中文管理台',
        loginSubtitle: '中文内容与外观控制中心',
        brandMark: 'S'
    },
    hero: {
        title: 'Serendipity',
        subtitle: 'Always curious, always creating',
        sideNote: '在雾里看代码，也在雾里看风景',
        badge: 'Serendipity · 二次元手记',
        scrollLabel: '下滑阅读文章'
    },
    home: {
        articlesTitle: '文章',
        articlesMoreText: '全部文章',
        lifeTitle: '生活',
        toolboxTitle: '工具箱',
        toolboxMoreText: '工具箱',
        galleryPhotos: [],
        toolboxDock: []
    },
    links: {
        hudTitle: '友链',
        hudSub: '星月图谱：中心明月串联友链 · 发光圆点为分类 · 悬停/点击星星显现站点图标',
        friends: []
    },
    life: {
        kicker: '生活手记',
        title: '生活手记',
        subtitle: '关于旅行、静日、美食与音乐的小小记录。',
        listHeading: '最近的生活记录',
        tagSlugs: ['travel', 'life', 'music', 'food', 'photography', 'anime'],
        pageSize: 9
    },
    toolbox: {
        tagSlug: 'toolbox',
        allButtonText: '✦ 全部工具',
        listHeading: '全部工具文章',
        emptyText: '暂无带有工具箱标签的文章，在中文管理台给文章加上对应标签即可出现在星环里。'
    },
    articles: {
        title: '文章归档',
        allButtonText: '✦ 全站文章',
        archiveHeading: '全站文章'
    },
    social: {
        wechat: '',
        emails: [],
        githubUrl: '',
        githubLabel: ''
    },
    wallpapers: {
        defaultId: 'meteor-sky',
        presets: []
    },
    effects: {
        enabled: true,
        readingDepth: 42,
        prism: true,
        cardTilt: true,
        particles: true,
        sparks: true,
        atmosphere: 'rain',
        frequency: 70,
        size: 70,
        scopeHome: true,
        scopeArchive: true,
        scopeLife: true,
        scopeToolbox: true,
        scopeAbout: true,
        scopePost: true,
        meteor: true,
        parallax: true,
        thread: false,
        progress: true,
        transitions: true,
        easter: true,
        readingGlow: true
    }
};

const ATMOSPHERE_MODES = new Set(['off', 'mist', 'petals', 'rain', 'fireflies']);

function normalizeEffects(source) {
    const effects = { ...DEFAULT_CONFIG.effects };
    for (const [key, fallback] of Object.entries(effects)) {
        const value = source?.[key];
        if (typeof fallback === 'boolean' && typeof value === 'boolean') {
            effects[key] = value;
        } else if (typeof fallback === 'number' && Number.isFinite(value)) {
            effects[key] = Math.round(Math.max(0, Math.min(key === 'readingDepth' ? 88 : 100, value)));
        } else if (key === 'atmosphere' && ATMOSPHERE_MODES.has(value)) {
            effects[key] = value;
        }
    }
    return effects;
}

function mergeConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        admin: { ...DEFAULT_CONFIG.admin, ...(src.admin || {}) },
        hero: { ...DEFAULT_CONFIG.hero, ...(src.hero || {}) },
        home: {
            ...DEFAULT_CONFIG.home,
            ...(src.home || {}),
            galleryPhotos: Array.isArray(src.home?.galleryPhotos) ? src.home.galleryPhotos : DEFAULT_CONFIG.home.galleryPhotos,
            toolboxDock: Array.isArray(src.home?.toolboxDock) ? src.home.toolboxDock : DEFAULT_CONFIG.home.toolboxDock
        },
        links: {
            ...DEFAULT_CONFIG.links,
            ...(src.links || {}),
            friends: Array.isArray(src.links?.friends) ? src.links.friends : DEFAULT_CONFIG.links.friends
        },
        life: {
            ...DEFAULT_CONFIG.life,
            ...(src.life || {}),
            tagSlugs: Array.isArray(src.life?.tagSlugs) ? src.life.tagSlugs.map(s => String(s).trim()).filter(Boolean) : DEFAULT_CONFIG.life.tagSlugs,
            pageSize: Math.max(1, Math.min(50, Number(src.life?.pageSize) || DEFAULT_CONFIG.life.pageSize))
        },
        toolbox: { ...DEFAULT_CONFIG.toolbox, ...(src.toolbox || {}) },
        articles: { ...DEFAULT_CONFIG.articles, ...(src.articles || {}) },
        social: {
            ...DEFAULT_CONFIG.social,
            ...(src.social || {}),
            emails: Array.isArray(src.social?.emails) ? src.social.emails.map(s => String(s).trim()).filter(Boolean) : DEFAULT_CONFIG.social.emails
        },
        wallpapers: {
            ...DEFAULT_CONFIG.wallpapers,
            ...(src.wallpapers || {}),
            presets: Array.isArray(src.wallpapers?.presets) ? src.wallpapers.presets : DEFAULT_CONFIG.wallpapers.presets
        },
        effects: normalizeEffects(src.effects)
    };
}

function readSiteConfig() {
    for (const candidate of [CONFIG_PATH, EXAMPLE_CONFIG_PATH]) {
        try {
            const text = fs.readFileSync(candidate, 'utf8');
            return mergeConfig(JSON.parse(text));
        } catch {
            // Try next fallback
        }
    }
    return mergeConfig({});
}

function writeSiteConfig(next) {
    const normalized = mergeConfig(next);
    const tmp = `${CONFIG_PATH}.tmp.${process.pid}.${Date.now()}`;
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, CONFIG_PATH);
    return normalized;
}

function safeJsonForScript(obj) {
    return JSON.stringify(obj)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function sendJson(res, status, data, extraHeaders = {}) {
    const body = Buffer.from(JSON.stringify(data), 'utf8');
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': body.length,
        ...extraHeaders
    });
    res.end(body);
}

function readBodyBuffer(req, maxBytes = 10 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
                reject(new Error('请求体超过大小限制'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function rewriteSetCookie(cookies) {
    if (!cookies) return cookies;
    const list = Array.isArray(cookies) ? cookies : [cookies];
    return list.map((c) => c.replace(/;\s*Path=\/ghost\/?(?=;|$)/gi, '; Path=/'));
}

function ghostRequest(method, ghostPath, { headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const reqHeaders = {
            host: PUBLIC_URL.host,
            origin: PUBLIC_URL.origin,
            referer: `${PUBLIC_URL.origin}/ghost/`,
            'x-forwarded-host': PUBLIC_URL.host,
            'x-forwarded-proto': PUBLIC_URL.protocol.replace(':', ''),
            ...headers
        };
        if (body !== null && !reqHeaders['content-length']) {
            reqHeaders['content-length'] = Buffer.byteLength(body);
        }
        const upstream = http.request(
            {
                hostname: GHOST_URL.hostname,
                port: GHOST_URL.port || 80,
                path: ghostPath,
                method,
                headers: reqHeaders
            },
            (upRes) => {
                const chunks = [];
                upRes.on('data', (c) => chunks.push(c));
                upRes.on('end', () => {
                    resolve({
                        status: upRes.statusCode || 502,
                        headers: upRes.headers,
                        body: Buffer.concat(chunks)
                    });
                });
            }
        );
        upstream.on('error', reject);
        if (body !== null) upstream.write(body);
        upstream.end();
    });
}

async function verifyAdminSession(req) {
    const cookie = req.headers.cookie;
    if (!cookie) return null;
    try {
        const result = await ghostRequest('GET', '/ghost/api/admin/users/me/?include=roles', {
            headers: {
                cookie,
                accept: 'application/json',
                'accept-version': 'v6.0'
            }
        });
        if (result.status !== 200) return null;
        const parsed = JSON.parse(result.body.toString('utf8'));
        const user = parsed?.users?.[0];
        return user || null;
    } catch {
        return null;
    }
}

function scanMediaFiles() {
    const results = [];
    if (!fs.existsSync(IMAGES_DIR)) return results;

    function walk(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.name === 'size' && dir === IMAGES_DIR) continue;
            if (entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (/\.(webp|png|jpe?g|gif|svg|avif)$/i.test(entry.name) && !/_o\.[^.]+$/i.test(entry.name)) {
                try {
                    const stat = fs.statSync(full);
                    const rel = path.relative(IMAGES_DIR, full).split(path.sep).join('/');
                    results.push({
                        name: entry.name,
                        path: rel,
                        url: `/content/images/${rel}`,
                        size: stat.size,
                        mtime: stat.mtime.toISOString()
                    });
                } catch {}
            }
        }
    }

    walk(IMAGES_DIR);
    results.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
    return results;
}

function serveStaticAdmin(req, res, pathname) {
    if (pathname === '/admin') {
        res.writeHead(302, { Location: '/admin/' });
        res.end();
        return;
    }
    let relPath = pathname.slice('/admin/'.length);
    if (!relPath || relPath.endsWith('/')) relPath += 'index.html';

    const target = path.resolve(PUBLIC_DIR, relPath);
    if (!target.startsWith(PUBLIC_DIR)) {
        sendJson(res, 403, { error: '禁止访问该路径' });
        return;
    }

    const finalPath = fs.existsSync(target) && fs.statSync(target).isFile()
        ? target
        : path.join(PUBLIC_DIR, 'index.html');

    try {
        const content = fs.readFileSync(finalPath);
        const ext = path.extname(finalPath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
            'Content-Length': content.length
        });
        res.end(content);
    } catch {
        sendJson(res, 404, { error: '管理台资源未找到' });
    }
}

async function handleApiLifePosts(req, res, urlObj) {
    const cfg = readSiteConfig();
    const page = Math.max(1, Number(urlObj.searchParams.get('page')) || 1);
    const limit = Math.max(1, Math.min(50, Number(urlObj.searchParams.get('limit')) || cfg.life.pageSize || 9));
    const tagSlugs = (cfg.life.tagSlugs || []).filter(s => /^[a-z0-9_-]+$/i.test(s));

    if (tagSlugs.length === 0) {
        sendJson(res, 200, {
            posts: [],
            pagination: { page: 1, limit, pages: 1, total: 0, prev: null, next: null },
            config: cfg.life
        });
        return;
    }

    if (!CONTENT_KEY) {
        sendJson(res, 500, { error: '未配置 Ghost Content API Key' });
        return;
    }

    const params = new URLSearchParams({
        key: CONTENT_KEY,
        include: 'tags,authors',
        fields: 'id,title,slug,url,published_at,reading_time,feature_image,feature_image_alt,custom_excerpt,excerpt',
        order: 'published_at desc',
        page: String(page),
        limit: String(limit),
        filter: `tag:[${tagSlugs.join(',')}]`
    });

    try {
        const up = await ghostRequest('GET', `/ghost/api/content/posts/?${params.toString()}`, {
            headers: { accept: 'application/json', 'accept-version': 'v6.0' }
        });
        if (up.status !== 200) {
            sendJson(res, up.status, { error: '读取生活栏目文章失败', detail: up.body.toString('utf8').slice(0, 300) });
            return;
        }
        const parsed = JSON.parse(up.body.toString('utf8'));
        sendJson(res, 200, {
            posts: parsed.posts || [],
            pagination: parsed.meta?.pagination || { page, limit, pages: 1, total: 0, prev: null, next: null },
            config: cfg.life
        });
    } catch (err) {
        sendJson(res, 502, { error: '连接 Ghost 内容接口失败', detail: String(err.message || err) });
    }
}

async function handleApiToolboxPosts(req, res) {
    const cfg = readSiteConfig();
    const slug = (cfg.toolbox?.tagSlug || 'toolbox').trim();
    if (!slug || !/^[a-z0-9_-]+$/i.test(slug)) {
        sendJson(res, 200, { posts: [], config: cfg.toolbox });
        return;
    }
    if (!CONTENT_KEY) {
        sendJson(res, 500, { error: '未配置 Ghost Content API Key' });
        return;
    }
    const params = new URLSearchParams({
        key: CONTENT_KEY,
        include: 'tags',
        fields: 'id,title,slug,url,published_at,feature_image,custom_excerpt,excerpt',
        order: 'published_at desc',
        limit: '100',
        filter: `tag:${slug}`
    });
    try {
        const up = await ghostRequest('GET', `/ghost/api/content/posts/?${params.toString()}`, {
            headers: { accept: 'application/json', 'accept-version': 'v6.0' }
        });
        if (up.status !== 200) {
            sendJson(res, up.status, { error: '读取工具箱文章失败' });
            return;
        }
        const parsed = JSON.parse(up.body.toString('utf8'));
        sendJson(res, 200, {
            posts: parsed.posts || [],
            config: cfg.toolbox
        });
    } catch (err) {
        sendJson(res, 502, { error: '连接 Ghost 内容接口失败', detail: String(err.message || err) });
    }
}

async function handleAdminLogin(req, res) {
    try {
        const raw = await readBodyBuffer(req, 64 * 1024);
        const data = JSON.parse(raw.toString('utf8') || '{}');
        const username = String(data.username || data.email || '').trim();
        const password = String(data.password || '');
        if (!username || !password) {
            sendJson(res, 400, { error: '请填写管理员邮箱和密码' });
            return;
        }
        const payload = JSON.stringify({ username, password });
        const loginHeaders = {
            'content-type': 'application/json',
            accept: 'application/json',
            'accept-version': 'v6.0'
        };
        if (req.headers['user-agent']) loginHeaders['user-agent'] = req.headers['user-agent'];
        const up = await ghostRequest('POST', '/ghost/api/admin/session', {
            headers: loginHeaders,
            body: payload
        });

        const setCookie = rewriteSetCookie(up.headers['set-cookie']);
        if (up.status >= 200 && up.status < 300) {
            const cookieHeader = Array.isArray(setCookie)
                ? setCookie.map((c) => c.split(';')[0]).join('; ')
                : (setCookie || '').split(';')[0];
            let user = null;
            if (cookieHeader) {
                const me = await ghostRequest('GET', '/ghost/api/admin/users/me/?include=roles', {
                    headers: { cookie: cookieHeader, accept: 'application/json', 'accept-version': 'v6.0' }
                });
                if (me.status === 200) {
                    try { user = JSON.parse(me.body.toString('utf8'))?.users?.[0] || null; } catch {}
                }
            }
            const extra = setCookie ? { 'Set-Cookie': setCookie } : {};
            sendJson(res, 200, { ok: true, user }, extra);
            return;
        }

        let errMsg = '邮箱或密码不正确，请重试';
        try {
            const errJson = JSON.parse(up.body.toString('utf8'));
            const rawMsg = errJson?.errors?.[0]?.message || '';
            if (/too many/i.test(rawMsg)) errMsg = '尝试次数过多，请稍后再试';
            else if (/no user/i.test(rawMsg) || /password/i.test(rawMsg)) errMsg = '管理员邮箱或密码不正确';
            else if (rawMsg) errMsg = rawMsg;
        } catch {}
        sendJson(res, up.status === 429 ? 429 : 401, { error: errMsg });
    } catch (err) {
        sendJson(res, 500, { error: '登录请求处理失败', detail: String(err.message || err) });
    }
}

async function handleAdminLogout(req, res) {
    try {
        if (req.headers.cookie) {
            await ghostRequest('DELETE', '/ghost/api/admin/session', {
                headers: {
                    cookie: req.headers.cookie,
                    accept: 'application/json',
                    'accept-version': 'v6.0'
                }
            });
        }
    } catch {}
    sendJson(
        res,
        200,
        { ok: true },
        {
            'Set-Cookie': [
                'ghost-admin-api-session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
                'ghost-admin-api-session=; Path=/ghost; Max-Age=0; HttpOnly; SameSite=Lax'
            ]
        }
    );
}

function proxyAdminGhostApi(req, res, urlObj) {
    const subPath = urlObj.pathname.slice('/api/admin/ghost'.length) || '/';
    const targetPath = `/ghost/api/admin${subPath}${urlObj.search}`;

    const headers = { ...req.headers };
    delete headers['accept-encoding'];
    headers.host = PUBLIC_URL.host;
    headers.origin = PUBLIC_URL.origin;
    headers.referer = `${PUBLIC_URL.origin}/ghost/`;
    headers['x-forwarded-host'] = PUBLIC_URL.host;
    headers['x-forwarded-proto'] = PUBLIC_URL.protocol.replace(':', '');
    if (!headers['accept-version']) headers['accept-version'] = 'v6.0';

    const upstream = http.request(
        {
            hostname: GHOST_URL.hostname,
            port: GHOST_URL.port || 80,
            path: targetPath,
            method: req.method,
            headers
        },
        (upRes) => {
            const respHeaders = { ...upRes.headers };
            if (respHeaders['set-cookie']) {
                respHeaders['set-cookie'] = rewriteSetCookie(respHeaders['set-cookie']);
            }
            respHeaders['cache-control'] = 'no-store';
            res.writeHead(upRes.statusCode || 502, respHeaders);
            upRes.pipe(res);
        }
    );

    upstream.on('error', (err) => {
        if (!res.headersSent) {
            sendJson(res, 502, { error: 'Ghost 后台接口代理失败', detail: String(err.message || err) });
        } else {
            res.end();
        }
    });

    req.pipe(upstream);
}

function proxyToGhost(req, res, urlObj) {
    const isGhostAdmin = urlObj.pathname === '/ghost' || urlObj.pathname.startsWith('/ghost/');
    const canInjectConfig = req.method === 'GET' && !isGhostAdmin && !urlObj.pathname.startsWith('/assets/') && !urlObj.pathname.startsWith('/content/');

    const headers = { ...req.headers };
    headers.host = PUBLIC_URL.host;
    headers['x-forwarded-host'] = PUBLIC_URL.host;
    headers['x-forwarded-proto'] = PUBLIC_URL.protocol.replace(':', '');
    if (canInjectConfig) {
        // Request plain HTML from local Ghost so we can inject window.__AG_SITE_CONFIG__ cleanly
        headers['accept-encoding'] = 'identity';
    }

    const upstream = http.request(
        {
            hostname: GHOST_URL.hostname,
            port: GHOST_URL.port || 80,
            path: urlObj.pathname + urlObj.search,
            method: req.method,
            headers
        },
        (upRes) => {
            const respHeaders = { ...upRes.headers };
            if (respHeaders['set-cookie']) {
                respHeaders['set-cookie'] = rewriteSetCookie(respHeaders['set-cookie']);
            }

            const contentType = String(respHeaders['content-type'] || '');
            const contentEncoding = String(respHeaders['content-encoding'] || '');
            const isHtmlStatus = (upRes.statusCode >= 200 && upRes.statusCode < 300) || upRes.statusCode >= 400;
            const shouldInject = canInjectConfig
                && isHtmlStatus
                && contentType.includes('text/html')
                && !contentEncoding;

            if (!shouldInject) {
                res.writeHead(upRes.statusCode || 502, respHeaders);
                upRes.pipe(res);
                return;
            }

            const chunks = [];
            upRes.on('data', (chunk) => chunks.push(chunk));
            upRes.on('end', () => {
                let html = Buffer.concat(chunks).toString('utf8');
                const cfg = readSiteConfig();
                const snippet = `<script id="ag-site-config-data">window.__AG_SITE_CONFIG__=${safeJsonForScript(cfg)};</script>`;
                if (/<head\b[^>]*>/i.test(html)) {
                    html = html.replace(/<head\b[^>]*>/i, (m) => `${m}\n${snippet}`);
                } else {
                    html = snippet + html;
                }
                const out = Buffer.from(html, 'utf8');
                delete respHeaders['content-length'];
                delete respHeaders['etag'];
                respHeaders['content-length'] = out.length;
                respHeaders['cache-control'] = 'no-cache';
                res.writeHead(upRes.statusCode || 200, respHeaders);
                res.end(out);
            });
        }
    );

    upstream.on('error', (err) => {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Ghost 服务暂时不可用，请稍后刷新重试。\n${err.message || ''}`);
        } else {
            res.end();
        }
    });

    req.pipe(upstream);
}

const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', PUBLIC_URL.origin);
    const { pathname } = urlObj;

    try {
        // 1. Custom Chinese Admin UI static files
        if (pathname === '/admin' || pathname.startsWith('/admin/')) {
            serveStaticAdmin(req, res, pathname);
            return;
        }

        // 2. Public dynamic site config & feed APIs
        if (pathname === '/api/admin-brand' && req.method === 'GET') {
            sendJson(res, 200, readSiteConfig().admin);
            return;
        }
        if (pathname === '/api/site-config' && req.method === 'GET') {
            sendJson(res, 200, readSiteConfig());
            return;
        }
        if (pathname === '/api/life-posts' && req.method === 'GET') {
            await handleApiLifePosts(req, res, urlObj);
            return;
        }
        if (pathname === '/api/toolbox-posts' && req.method === 'GET') {
            await handleApiToolboxPosts(req, res);
            return;
        }

        // 3. Admin Auth endpoints
        if (pathname === '/api/admin/login' && req.method === 'POST') {
            await handleAdminLogin(req, res);
            return;
        }
        if (pathname === '/api/admin/logout' && req.method === 'POST') {
            await handleAdminLogout(req, res);
            return;
        }
        if (pathname === '/api/admin/me' && req.method === 'GET') {
            const user = await verifyAdminSession(req);
            if (!user) {
                sendJson(res, 401, { error: '未登录或会话已过期' });
                return;
            }
            sendJson(res, 200, { user });
            return;
        }

        // 4. Protected Admin Site-Config & Media endpoints
        if (pathname === '/api/admin/site-config') {
            const user = await verifyAdminSession(req);
            if (!user) {
                sendJson(res, 401, { error: '未登录或会话已过期，请重新登录' });
                return;
            }
            if (req.method === 'GET') {
                sendJson(res, 200, readSiteConfig());
                return;
            }
            if (req.method === 'PUT' || req.method === 'PATCH') {
                const raw = await readBodyBuffer(req, 2 * 1024 * 1024);
                let parsed;
                try {
                    parsed = JSON.parse(raw.toString('utf8'));
                } catch {
                    sendJson(res, 400, { error: '配置 JSON 格式无效' });
                    return;
                }
                if (req.method === 'PATCH') {
                    const current = readSiteConfig();
                    const merged = { ...current };
                    for (const section of Object.keys(DEFAULT_CONFIG)) {
                        if (parsed && typeof parsed[section] === 'object' && parsed[section] !== null) {
                            merged[section] = { ...(current[section] || {}), ...parsed[section] };
                        }
                    }
                    const saved = writeSiteConfig(merged);
                    sendJson(res, 200, { ok: true, config: saved });
                    return;
                }
                const saved = writeSiteConfig(parsed);
                sendJson(res, 200, { ok: true, config: saved });
                return;
            }
            sendJson(res, 405, { error: '不支持的请求方法' });
            return;
        }

        if (pathname === '/api/admin/media' && req.method === 'GET') {
            const user = await verifyAdminSession(req);
            if (!user) {
                sendJson(res, 401, { error: '未登录或会话已过期，请重新登录' });
                return;
            }
            sendJson(res, 200, { images: scanMediaFiles() });
            return;
        }

        // 5. Protected Transparent Proxy to Ghost Admin API
        if (pathname.startsWith('/api/admin/ghost/')) {
            proxyAdminGhostApi(req, res, urlObj);
            return;
        }

        // 5.5 Redirect native Ghost Admin UI (/ghost/) to Chinese Admin UI (/admin/), preserving /ghost/api/*
        if (pathname === '/ghost' || (pathname.startsWith('/ghost/') && !pathname.startsWith('/ghost/api/'))) {
            res.writeHead(302, { Location: '/admin/', 'Cache-Control': 'no-store' });
            res.end();
            return;
        }

        // 6. Everything else -> Ghost (public site + /ghost/api/* + /content/ + /assets/)
        proxyToGhost(req, res, urlObj);
    } catch (err) {
        if (!res.headersSent) {
            sendJson(res, 500, { error: '网关服务内部错误', detail: String(err.message || err) });
        }
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[blog-gateway] listening on :${PORT}, proxying Ghost at ${GHOST_URL.origin}`);
});
