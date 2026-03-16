let theme = $state(
	typeof window !== 'undefined'
		? localStorage.getItem('theme') || 'light'
		: 'light'
);

export function getTheme() {
	return theme;
}

export function setTheme(t) {
	theme = t;
	localStorage.setItem('theme', t);
	document.documentElement.classList.toggle('dark', t === 'dark');
}

export function toggleTheme() {
	setTheme(theme === 'dark' ? 'light' : 'dark');
}
