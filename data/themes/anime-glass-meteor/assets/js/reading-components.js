(function () {
    const contents = document.querySelectorAll('.ag-content');
    if (contents.length === 0) return;

    // 只高亮随主题分发的语言，其他代码块保持正文原样。
    const languages = new Set(['bash', 'sh', 'shell', 'go', 'javascript', 'js', 'css']);
    const prism = window.Prism;

    for (const content of contents) {
        if (prism?.highlightElement) {
            for (const code of content.querySelectorAll('pre > code')) {
                const language = prism.util.getLanguage(code);
                if (languages.has(language)) prism.highlightElement(code);
            }
        }

        for (const table of content.querySelectorAll('table:not(.gist table)')) {
            if (table.closest('.ag-reading-table')) continue;

            const frame = document.createElement('div');
            frame.className = 'ag-reading-table';
            frame.tabIndex = 0;
            frame.setAttribute('role', 'region');
            frame.setAttribute('aria-label', table.caption?.textContent.trim() || '文章表格');
            table.before(frame);
            frame.append(table);
        }
    }

    // 兼容首页工具箱卡片的短链接，同时保留 Ghost 已发布的标题锚点。
    const toolbox = document.querySelector('.page-toolbox .ag-content');
    if (!toolbox) return;
    const sections = new Map([['小脚本', 'script'], ['常用网址', 'site'], ['阅读清单', 'read']]);
    for (const heading of toolbox.querySelectorAll('h2')) {
        const id = sections.get(heading.textContent.trim());
        if (!id || document.getElementById(id)) continue;
        const anchor = document.createElement('span');
        anchor.id = id;
        anchor.className = 'ag-toolbox-anchor';
        anchor.setAttribute('aria-hidden', 'true');
        heading.prepend(anchor);
        if (window.location.hash === '#' + id) {
            const reveal = () => anchor.scrollIntoView({ block: 'start', behavior: 'instant' });
            if (document.readyState === 'complete') reveal();
            else window.addEventListener('load', reveal, { once: true });
        }
    }
})();
