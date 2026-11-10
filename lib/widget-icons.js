'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const catalog = JSON.parse(zlib.gunzipSync(
	fs.readFileSync(path.join(__dirname, '..', 'assets', 'fontawesome-icons.json.gz'))
).toString('utf8'));

const styles = { fas: 'Solid', far: 'Regular', fab: 'Brands' };
const defaultNames = {
	'fas:clock': 'Timer (clock)',
	'fas:stopwatch': 'Stopwatch',
	'fas:shuffle': 'Transition (shuffle)'
};
const icons = catalog.map(([style, name, width, height, paths, aliases]) => ({
	id: style + ':' + name,
	name,
	style,
	width,
	height,
	paths: Array.isArray(paths) ? paths : [paths],
	aliases
})).sort((a, b) => a.name.localeCompare(b.name) || a.style.localeCompare(b.style));

const preferredIds = ['fas:clock', 'fas:stopwatch', 'fas:shuffle'];
const preferred = preferredIds.map(id => {
	const icon = icons.find(item => item.id === id);
	if (!icon) throw new Error('Missing default Font Awesome icon: ' + id);
	return icon;
});

function toResult(icon) {
	const paths = icon.paths.map(d => '<path d="' + d + '"/>').join('');
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '
		+ icon.width + ' ' + icon.height + '" fill="#2f8df6">' + paths + '</svg>';
	return {
		id: icon.id,
		name: defaultNames[icon.id] || icon.name.replace(/-/g, ' '),
		description: styles[icon.style],
		image: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
	};
}

function searchIcons(query, noneLabel) {
	const search = (query || '').trim().toLowerCase().replace(/\s+/g, '-');
	const matches = icon => icon.name.includes(search)
		|| (defaultNames[icon.id] && defaultNames[icon.id].toLowerCase().includes(search))
		|| icon.aliases.some(alias => alias.includes(search));
	const results = preferred.filter(matches).map(toResult);
	if (!search || noneLabel.toLowerCase().includes(search) || 'none'.includes(search)) {
		results.push({ id: 'none', name: noneLabel });
	}
	for (const icon of icons) {
		if (results.length >= 100) break;
		if (!preferredIds.includes(icon.id) && matches(icon)) results.push(toResult(icon));
	}
	return results;
}

module.exports = { searchIcons };
