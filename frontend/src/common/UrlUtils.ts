export function cleanUrlParams(): void {
	window.history.replaceState({}, document.title, window.location.pathname);
}

export function getUrlParam(param: string): string | undefined {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.get(param) ?? undefined;
}
