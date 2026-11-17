'use strict';

const fs = require('fs');
const path = require('path');
const { minify_sync } = require('terser');
const CleanCSS = require('clean-css');

const root = path.resolve(__dirname, '..', '..');
const javascript = [
	'assets/js/angular.min.js',
	'assets/js/chronograph-widget-style.js',
	'assets/js/chronograph-errors.js',
	'assets/js/chronograph-widget.js',
	'assets/js/multiple-chronographs-widget.js'
];
const vendorStylesheets = [
	'assets/css/fontawesome.min.css',
	'assets/css/solid.min.css',
	'assets/css/regular.min.css',
	'assets/css/brands.min.css'
];
const stylesheets = [
	'assets/css/chronograph-surfaces.css',
	'assets/css/chronograph-icons.css',
	'assets/css/chronograph-widget.css',
	'assets/css/multiple-chronographs-widget.css'
];
const template = 'assets/templates/chronograph-widget-design.html';

function read(file) {
	return fs.readFileSync(path.join(root, ...file.split('/')), 'utf8').replace(/\r\n/g, '\n');
}

function build() {
	const scripts = javascript.map(file => {
		const source = read(file);
		return file === 'assets/js/angular.min.js'
			? source.replace(/^\/\/# sourceMappingURL=.*\r?\n?/m, '')
			: source;
	});
	const angular = scripts.shift();
	scripts.push("angular.module('chronographWidget').run(['$templateCache', function ($templateCache) {\n"
		+ "\t$templateCache.put('../../assets/templates/chronograph-widget-design.html', " + JSON.stringify(read(template)) + ");\n"
		+ '}]);');
	const script = minify_sync(scripts.join('\n;\n'), {
		ecma: 5,
		format: { comments: /@license|@preserve|^!/ }
	});
	const stylesheet = new CleanCSS({
		rebase: false,
		level: { 1: { specialComments: 'all' }, 2: false }
	}).minify(stylesheets.map(read).join('\n'));
	const problems = stylesheet.errors.concat(stylesheet.warnings);
	if (problems.length) throw new Error('Unable to build widget CSS: ' + problems.join('; '));
	return {
		'assets/js/widget-bundle.js': angular + '\n;\n' + script.code + '\n',
		'assets/css/widget-bundle.css': vendorStylesheets.map(read).concat(stylesheet.styles).join('\n') + '\n'
	};
}

if (require.main === module) {
	for (const [file, content] of Object.entries(build())) {
		fs.writeFileSync(path.join(root, ...file.split('/')), content, 'utf8');
		console.log('Built ' + file);
	}
}

module.exports = build;
