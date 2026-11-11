'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const port = Number(process.env.CHRONOGRAPH_PREVIEW_PORT || 4178);
const mime = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.ttf': 'font/ttf',
	'.svg': 'image/svg+xml',
	'.png': 'image/png'
};

const server = http.createServer((request, response) => {
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		response.writeHead(405, { Allow: 'GET, HEAD' }).end();
		return;
	}
	let url;
	try {
		url = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
	} catch (error) {
		response.writeHead(400).end('Invalid URL');
		return;
	}
	if (url === '/') url = '/settings/index.html';
	if (url === '/homey.js') url = '/tools/development/settings-preview-homey.js';
	if (!/^\/(?:settings\/|assets\/|\.homeycompose\/locales\/|tools\/development\/settings-preview-homey\.js$)/.test(url)
		|| url.split('/').some(part => part === '..' || part === '.')
		|| url.includes('\\')) {
		response.writeHead(404).end('Not found');
		return;
	}
	const file = path.resolve(root, '.' + url.replace(/\//g, path.sep));
	const allowedRoot = path.resolve(root);
	if (!file.startsWith(allowedRoot + path.sep)) {
		response.writeHead(404).end('Not found');
		return;
	}
	fs.readFile(file, (error, data) => {
		if (error) {
			response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500);
			response.end(error.code === 'ENOENT' || error.code === 'EISDIR' ? 'Not found' : 'Could not read preview file');
			if (error.code !== 'ENOENT' && error.code !== 'EISDIR') console.error(error);
			return;
		}
		response.writeHead(200, {
			'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff'
		});
		response.end(request.method === 'HEAD' ? undefined : data);
	});
});

server.listen(port, '127.0.0.1', () => {
	console.log('Settings preview: http://127.0.0.1:' + port + '/settings/index.html');
});
