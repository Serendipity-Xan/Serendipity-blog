export function mountCometProgress(settings) {
    const track = document.querySelector('.ag-progress');
    const comet = track?.querySelector('.ag-reading-comet');
    if (!comet) return;

    settings.subscribe(policy => {
        const active = policy.enabled && policy.progress;
        track.toggleAttribute('data-ag-comet-progress', active);
        comet.hidden = !active;
    });
}
