/* The head applies the selected preset before the page paints. */
(() => {
    const wallpaper = window.agWallpaper;
    const selector = document.querySelector('[data-wallpaper-select]');
    if (!wallpaper || !selector) return;

    selector.replaceChildren(...wallpaper.presets.map(({id, label}) => new Option(label, id)));
    selector.value = wallpaper.choice;
    selector.addEventListener('change', () => wallpaper.apply(selector.value));
})();
