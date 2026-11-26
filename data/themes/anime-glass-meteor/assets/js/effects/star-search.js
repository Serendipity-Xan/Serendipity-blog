export function mountStarSearch(settings) {
    const results = document.getElementById('ag-cmdk-list');
    if (!results) return;
    settings.subscribe(policy => results.toggleAttribute('data-ag-star-search', policy.enabled && policy.starSearch));
}
