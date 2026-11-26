function escapeHtmlText(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeAttrText(str) {
    return escapeHtmlText(str).replace(/"/g, '&quot;');
}

function sanitizeUrl(url) {
    const u = String(url ?? '').trim();
    if (!u) return '';
    if (/^\s*javascript:/i.test(u)) return '#';
    return u;
}

function renderInline(text) {
    if (!text) return '';
    const tokens = [];
    const stash = (html) => {
        const idx = tokens.length;
        tokens.push(html);
        return `\u0000T${idx}\u0000`;
    };

    // 1. 提取行内代码
    let s = text.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${escapeHtmlText(code)}</code>`));

    // 2. 提取图片 ![alt](url "title")
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, url, title) => {
        const safeUrl = escapeAttrText(sanitizeUrl(url));
        const safeAlt = escapeAttrText(alt);
        const titleAttr = title ? ` title="${escapeAttrText(title)}"` : '';
        return stash(`<img src="${safeUrl}" alt="${safeAlt}"${titleAttr}>`);
    });

    // 3. 提取链接 [text](url "title")
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, label, url, title) => {
        const safeUrl = escapeAttrText(sanitizeUrl(url));
        const titleAttr = title ? ` title="${escapeAttrText(title)}"` : '';
        const isExt = /^https?:\/\//i.test(url);
        const relAttr = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
        return stash(`<a href="${safeUrl}"${titleAttr}${relAttr}>${renderInlineSimple(label, tokens)}</a>`);
    });

    s = escapeHtmlText(s);
    s = applyEmphasis(s);

    // 还原占位符
    s = s.replace(/\u0000T(\d+)\u0000/g, (_, idx) => tokens[Number(idx)] ?? '');
    return s;
}

function renderInlineSimple(label, tokens) {
    let s = escapeHtmlText(label);
    s = applyEmphasis(s);
    return s.replace(/\u0000T(\d+)\u0000/g, (_, idx) => tokens[Number(idx)] ?? '');
}

function applyEmphasis(s) {
    // 粗斜体
    s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    // 粗体
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    // 斜体
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    // 删除线
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    return s;
}

function splitTableRow(line) {
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
    if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
    return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
    const trimmed = line.trim();
    if (!trimmed.includes('-')) return false;
    const cells = splitTableRow(trimmed);
    return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function parseTableAlignments(line) {
    return splitTableRow(line).map((c) => {
        const left = c.startsWith(':');
        const right = c.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return '';
    });
}

export function markdownToHtml(md) {
    const src = String(md ?? '').replace(/\r\n?/g, '\n');
    const lines = src.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // 空行
        if (/^\s*$/.test(line)) {
            i++;
            continue;
        }

        // 围栏代码块 ```lang
        const fenceMatch = line.match(/^```([^\s`]*)\s*$/);
        if (fenceMatch) {
            const lang = fenceMatch[1].trim();
            const codeLines = [];
            i++;
            while (i < lines.length && !/^```\s*$/.test(lines[i])) {
                codeLines.push(lines[i]);
                i++;
            }
            if (i < lines.length) i++;
            const langClass = lang ? ` class="language-${escapeAttrText(lang)}"` : '';
            out.push(`<pre><code${langClass}>${escapeHtmlText(codeLines.join('\n'))}</code></pre>`);
            continue;
        }

        // 标题 h1-h6
        const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            out.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
            i++;
            continue;
        }

        // 分割线
        if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) {
            out.push('<hr>');
            i++;
            continue;
        }

        // 独立图片行 -> figure（仅当显式提供 Markdown 图片标题 "caption" 时输出 figcaption）
        const imgLineMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
        if (imgLineMatch) {
            const alt = imgLineMatch[1];
            const url = sanitizeUrl(imgLineMatch[2]);
            const title = imgLineMatch[3];
            const capHtml = title ? `<figcaption>${escapeHtmlText(title)}</figcaption>` : '';
            out.push(`<figure class="kg-card kg-image-card"><img src="${escapeAttrText(url)}" alt="${escapeAttrText(alt)}" loading="lazy">${capHtml}</figure>`);
            i++;
            continue;
        }

        // GFM 表格
        if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
            const headers = splitTableRow(line);
            const aligns = parseTableAlignments(lines[i + 1]);
            i += 2;
            const rows = [];
            while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
                rows.push(splitTableRow(lines[i]));
                i++;
            }
            const thHtml = headers
                .map((h, idx) => {
                    const align = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
                    return `<th${align}>${renderInline(h)}</th>`;
                })
                .join('');
            const bodyHtml = rows
                .map((r) => {
                    const tds = headers
                        .map((_, idx) => {
                            const align = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
                            return `<td${align}>${renderInline(r[idx] ?? '')}</td>`;
                        })
                        .join('');
                    return `<tr>${tds}</tr>`;
                })
                .join('');
            out.push(`<table><thead><tr>${thHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`);
            continue;
        }

        // 引用块
        if (/^\s*>\s?/.test(line)) {
            const quoteLines = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
                i++;
            }
            out.push(`<blockquote>${markdownToHtml(quoteLines.join('\n'))}</blockquote>`);
            continue;
        }

        // 无序列表
        if (/^\s*[-*+]\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
                i++;
            }
            out.push(`<ul>${items.map((it) => `<li>${renderInline(it)}</li>`).join('')}</ul>`);
            continue;
        }

        // 有序列表
        if (/^\s*\d+\.\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
                i++;
            }
            out.push(`<ol>${items.map((it) => `<li>${renderInline(it)}</li>`).join('')}</ol>`);
            continue;
        }

        // 普通段落
        const paraLines = [];
        while (
            i < lines.length &&
            !/^\s*$/.test(lines[i]) &&
            !/^```/.test(lines[i]) &&
            !/^#{1,6}\s+/.test(lines[i]) &&
            !/^\s*(?:[-*_]\s*){3,}$/.test(lines[i]) &&
            !/^\s*>\s?/.test(lines[i]) &&
            !/^\s*[-*+]\s+/.test(lines[i]) &&
            !/^\s*\d+\.\s+/.test(lines[i]) &&
            !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
        ) {
            paraLines.push(lines[i]);
            i++;
        }
        if (paraLines.length > 0) {
            out.push(`<p>${paraLines.map((l) => renderInline(l)).join('<br>')}</p>`);
        }
    }

    return out.join('\n');
}

function nodeChildrenToMd(node, ctx = {}) {
    return Array.from(node.childNodes)
        .map((child) => nodeToMd(child, ctx))
        .join('');
}

function tableNodeToMd(table) {
    const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.children).map((cell) => nodeChildrenToMd(cell).replace(/\n+/g, ' ').trim())
    );
    if (rows.length === 0) return '';
    const colCount = Math.max(...rows.map((r) => r.length));
    const padRow = (r) => {
        const copy = r.slice();
        while (copy.length < colCount) copy.push('');
        return `| ${copy.join(' | ')} |`;
    };
    const header = padRow(rows[0]);
    const sep = `| ${Array(colCount).fill('---').join(' | ')} |`;
    const body = rows.slice(1).map(padRow);
    return `\n\n${[header, sep, ...body].join('\n')}\n\n`;
}

function nodeToMd(node, ctx = {}) {
    if (node.nodeType === 3) {
        const text = node.nodeValue || '';
        if (ctx.inPre) return text;
        return text.replace(/\s+/g, ' ');
    }
    if (node.nodeType !== 1) return '';

    const tag = node.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        const content = nodeChildrenToMd(node, ctx).trim();
        return `\n\n${'#'.repeat(level)} ${content}\n\n`;
    }

    switch (tag) {
        case 'p': {
            const content = nodeChildrenToMd(node, ctx).trim();
            return content ? `\n\n${content}\n\n` : '';
        }
        case 'br':
            return '\n';
        case 'hr':
            return '\n\n---\n\n';
        case 'strong':
        case 'b': {
            const inner = nodeChildrenToMd(node, ctx).trim();
            return inner ? `**${inner}**` : '';
        }
        case 'em':
        case 'i': {
            const inner = nodeChildrenToMd(node, ctx).trim();
            return inner ? `*${inner}*` : '';
        }
        case 'del':
        case 's':
        case 'strike': {
            const inner = nodeChildrenToMd(node, ctx).trim();
            return inner ? `~~${inner}~~` : '';
        }
        case 'code': {
            if (ctx.inPre) return node.textContent || '';
            const code = (node.textContent || '').replace(/`/g, '\\`');
            return `\`${code}\``;
        }
        case 'pre': {
            const codeEl = node.querySelector('code');
            let lang = '';
            if (codeEl && codeEl.className) {
                const m = codeEl.className.match(/language-([^\s"]+)/);
                if (m) lang = m[1];
            }
            const raw = (codeEl ? codeEl.textContent : node.textContent) || '';
            const clean = raw.replace(/^\n+|\n+$/g, '');
            return `\n\n\`\`\`${lang}\n${clean}\n\`\`\`\n\n`;
        }
        case 'blockquote': {
            const inner = nodeChildrenToMd(node, ctx).trim();
            if (!inner) return '';
            const lines = inner.split('\n').map((l) => `> ${l}`);
            return `\n\n${lines.join('\n')}\n\n`;
        }
        case 'ul': {
            const items = Array.from(node.children)
                .filter((el) => el.tagName.toLowerCase() === 'li')
                .map((li) => `- ${nodeChildrenToMd(li, ctx).trim().replace(/\n+/g, '\n  ')}`);
            return items.length ? `\n\n${items.join('\n')}\n\n` : '';
        }
        case 'ol': {
            const items = Array.from(node.children)
                .filter((el) => el.tagName.toLowerCase() === 'li')
                .map((li, idx) => `${idx + 1}. ${nodeChildrenToMd(li, ctx).trim().replace(/\n+/g, '\n   ')}`);
            return items.length ? `\n\n${items.join('\n')}\n\n` : '';
        }
        case 'a': {
            const href = node.getAttribute('href') || '';
            const label = nodeChildrenToMd(node, ctx).trim() || href;
            if (!href) return label;
            return `[${label}](${href})`;
        }
        case 'img': {
            const src = node.getAttribute('src') || '';
            const alt = node.getAttribute('alt') || '';
            if (!src) return '';
            return `![${alt}](${src})`;
        }
        case 'figure': {
            const img = node.querySelector('img');
            if (img) {
                const src = img.getAttribute('src') || '';
                const alt = img.getAttribute('alt') || '';
                const cap = node.querySelector('figcaption')?.textContent?.trim() || '';
                if (!src) return '';
                const safeCap = cap.replace(/"/g, "'");
                return safeCap ? `\n\n![${alt}](${src} "${safeCap}")\n\n` : `\n\n![${alt}](${src})\n\n`;
            }
            return `\n\n${nodeChildrenToMd(node, ctx).trim()}\n\n`;
        }
        case 'table':
            return tableNodeToMd(node);
        case 'div':
        case 'section':
        case 'article':
        case 'main':
        case 'span':
        case 'figcaption':
            return nodeChildrenToMd(node, ctx);
        default:
            return nodeChildrenToMd(node, ctx);
    }
}

export function htmlToMarkdown(html) {
    const raw = String(html ?? '').trim();
    if (!raw) return '';
    if (typeof DOMParser === 'undefined') {
        return raw.replace(/<[^>]+>/g, '');
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${raw}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return '';
    const md = nodeChildrenToMd(root)
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return md;
}
