'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Resvg } = require('@resvg/resvg-js');

const assets = path.join(__dirname, '..', '..', 'assets');
const catalog = JSON.parse(zlib.gunzipSync(fs.readFileSync(
	path.join(assets, 'fontawesome-icons.json.gz')
)));
const previews = {};

for (const [style, name, width, height, pathData] of catalog) {
	const paths = (Array.isArray(pathData) ? pathData : [pathData])
		.map(d => '<path d="' + d + '"/>').join('');
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '
		+ width + ' ' + height + '" fill="#2f8df6">' + paths + '</svg>';
	previews[style + ':' + name] = new Resvg(svg, {
		fitTo: { mode: 'zoom', value: 64 / Math.max(width, height) }
	}).render().asPng().toString('base64');
}

fs.writeFileSync(
	path.join(assets, 'fontawesome-previews.json.gz'),
	zlib.gzipSync(Buffer.from(JSON.stringify(previews)), { level: 9 })
);
