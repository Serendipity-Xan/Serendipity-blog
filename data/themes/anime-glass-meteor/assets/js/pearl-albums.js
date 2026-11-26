(() => {
    const section = document.querySelector('[data-life-albums]');
    const configuredAlbums = window.__AG_SITE_CONFIG__?.life?.albums;
    if (!section || !Array.isArray(configuredAlbums)) return;

    const albums = configuredAlbums
        .filter(album => album && typeof album.id === 'string' && typeof album.title === 'string' && Array.isArray(album.photos))
        .map(album => ({
            ...album,
            photos: album.photos.filter(photo => photo && typeof photo.src === 'string'
                && photo.src.startsWith('/content/images/') && Number.isInteger(photo.width) && photo.width > 0
                && Number.isInteger(photo.height) && photo.height > 0)
        }))
        .filter(album => album.photos.length);
    if (!albums.length) return;

    const albumId = new URLSearchParams(window.location.search).get('album');
    const selected = albums.find(album => album.id === albumId);

    function makeThumbnail(photo, alt) {
        const image = document.createElement('img');
        image.width = photo.width;
        image.height = photo.height;
        image.alt = alt;
        image.loading = 'lazy';
        image.decoding = 'async';
        const thumbnail = typeof photo.thumbnail === 'string' && photo.thumbnail.startsWith('/content/images/')
            ? photo.thumbnail
            : photo.src.replace('/content/images/', '/content/images/size/w600/');
        image.addEventListener('error', () => { image.src = photo.src; }, { once: true });
        image.src = thumbnail;
        return image;
    }

    if (!selected) {
        section.dataset.view = 'index';
        for (const album of albums) {
            const card = document.createElement('a');
            card.className = 'ag-album-card';
            card.href = '/life/?' + new URLSearchParams({ album: album.id });
            const cover = album.photos[album.coverIndex] || album.photos[0];
            const caption = document.createElement('span');
            caption.className = 'ag-album-caption';
            const title = document.createElement('strong');
            title.textContent = album.title;
            const photoCount = document.createElement('span');
            photoCount.textContent = `${album.photos.length} 张`;
            caption.append(title, photoCount);
            card.append(makeThumbnail(cover, ''), caption);
            section.append(card);
        }
        section.hidden = false;
        return;
    }

    section.dataset.view = 'album';
    const photoCount = selected.photos.length;
    document.querySelector('[data-life-album-back]').hidden = false;
    document.querySelector('[data-life-journal]').hidden = true;
    document.getElementById('ag-life-kicker').hidden = true;
    document.getElementById('ag-life-heading').textContent = selected.title;
    document.getElementById('ag-life-subtitle').textContent = `${photoCount} 张照片`;
    document.title = `${selected.title} · ${document.title}`;

    const viewer = document.querySelector('[data-life-album-viewer]');
    const viewerImage = viewer.querySelector('[data-album-image]');
    const position = viewer.querySelector('[data-album-position]');
    const prev = viewer.querySelector('[data-album-step="-1"]');
    const next = viewer.querySelector('[data-album-step="1"]');
    const title = document.getElementById('ag-album-viewer-title');
    title.textContent = selected.title;
    viewer.querySelector('[data-album-navigation]').hidden = photoCount === 1;

    let current = 0;
    let opener;

    function showPhoto(index) {
        current = (index + photoCount) % photoCount;
        const photo = selected.photos[current];
        viewerImage.alt = photo.alt || `${selected.title}，第 ${current + 1} 张照片`;
        viewerImage.src = photo.src;
        position.textContent = `${current + 1} / ${photoCount}`;
    }

    for (const [index, photo] of selected.photos.entries()) {
        const link = document.createElement('a');
        link.className = 'ag-album-photo';
        link.href = photo.src;
        link.append(makeThumbnail(photo, photo.alt || `${selected.title}，第 ${index + 1} 张照片`));
        link.addEventListener('click', event => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof viewer.showModal !== 'function') return;
            event.preventDefault();
            opener = link;
            showPhoto(index);
            viewer.showModal();
        });
        section.append(link);
    }
    section.hidden = false;

    prev.addEventListener('click', () => showPhoto(current - 1));
    next.addEventListener('click', () => showPhoto(current + 1));
    viewer.querySelector('[data-album-close]').addEventListener('click', () => viewer.close());
    viewer.addEventListener('keydown', event => {
        if (photoCount < 2 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        showPhoto(current + (event.key === 'ArrowLeft' ? -1 : 1));
    });
    viewer.addEventListener('close', () => opener?.focus({ preventScroll: true }));
})();
