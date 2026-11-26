const NATIVE_STYLE_ID = 'ag-native-transition';

function setNativeNavigation(enabled) {
    const current = document.getElementById(NATIVE_STYLE_ID);
    if (!enabled) {
        current?.remove();
        return;
    }
    if (current || !('onpageswap' in window) || !('onpagereveal' in window)) return;

    const style = document.createElement('style');
    style.id = NATIVE_STYLE_ID;
    style.textContent = '@view-transition { navigation: auto; }';
    document.head.append(style);
}

export function mountTransitions(settings) {
    const root = document.documentElement;
    const navigation = performance.getEntriesByType('navigation')[0];
    let presented = navigation?.type === 'back_forward';
    let nativeEnabled = false;

    // 原生导航和锚点沿用浏览器行为，页面只调整浏览器提供的转场。
    window.addEventListener('pageswap', event => {
        if (!nativeEnabled) event.viewTransition?.skipTransition();
    });
    window.addEventListener('pagereveal', event => {
        if (event.viewTransition && !nativeEnabled) event.viewTransition.skipTransition();
    });
    window.addEventListener('pagehide', () => { delete root.dataset.agEntry; });

    settings.subscribe(policy => {
        nativeEnabled = policy.configured && policy.transitions;
        setNativeNavigation(nativeEnabled);

        if (!policy.enabled || !policy.transitions) {
            delete root.dataset.agEntry;
            return;
        }
        // 首次入口只给现有装饰线和标题打光，不更改内容的可见性。
        if (!presented) {
            presented = true;
            if (performance.now() > 2400) return;
            const duration = Math.round(230 + policy.intensity * (policy.compact ? 100 : 180));
            root.style.setProperty('--ag-entry-duration', `${duration}ms`);
            root.dataset.agEntry = '';
        }
    });
}
