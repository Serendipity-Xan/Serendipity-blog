export function mountReadingGlow(settings) {
    const track = document.querySelector('.ag-progress');
    if (!track) return;

    let enabled = false;
    let shown = false;
    function clearGlow() { track.removeAttribute('data-ag-reading-finish'); }

    function showGlow() {
        if (!enabled || shown) return;
        shown = true;
        track.setAttribute('data-ag-reading-finish', '');
    }

    track.addEventListener('ag:reading-complete', showGlow);
    track.addEventListener('animationend', event => {
        if (event.animationName === 'ag-reading-afterglow') clearGlow();
    });
    settings.subscribe(policy => {
        enabled = policy.enabled && policy.readingGlow;
        if (!enabled) clearGlow();
        // A fragment link or history restoration can reach the end before this module loads.
        else if (Number(track.style.getPropertyValue('--ag-reading-progress')) === 1) showGlow();
    });
}
