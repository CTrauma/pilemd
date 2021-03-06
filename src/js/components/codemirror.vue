<template lang="pug">
	div
</template>

<script>
	const fs = require('fs');
	const path = require('path');

	const _ = require('lodash');

	const Image = require('../models').Image;

	const electron = require('electron');
	const { remote, shell, clipboard } = electron;
	const { Menu, MenuItem, dialog } = remote;

	const { copyText, cutText, pasteText, selectAllText } = require('../codemirror/elutils');

	const IMAGE_TAG_TEMP = _.template('![<%- filename %>](<%- fileurl %>)\n');

	require('codemirror/lib/codemirror.css');

	const CodeMirror = require('codemirror');

	require('codemirror/addon/search/searchcursor');
	require('../codemirror/piledsearch');
	require('codemirror/addon/edit/closebrackets');
	require('codemirror/addon/mode/overlay');
	require('../codemirror/placeholder');
	require('codemirror/mode/xml/xml');
	require('codemirror/mode/markdown/markdown');
	require('codemirror/mode/gfm/gfm');
	require('codemirror/mode/rst/rst');
	require('../codemirror/piledmd');
	require('codemirror/mode/python/python');
	require('codemirror/mode/javascript/javascript');
	require('codemirror/mode/coffeescript/coffeescript');
	require('codemirror/mode/pug/pug');
	require('codemirror/mode/css/css');
	require('codemirror/mode/htmlmixed/htmlmixed');
	require('codemirror/mode/clike/clike');
	require('codemirror/mode/http/http');
	require('codemirror/mode/ruby/ruby');
	require('codemirror/mode/lua/lua');
	require('codemirror/mode/go/go');
	require('codemirror/mode/php/php');
	require('codemirror/mode/perl/perl');
	require('codemirror/mode/swift/swift');
	require('codemirror/mode/go/go');
	require('codemirror/mode/sql/sql');
	require('codemirror/mode/yaml/yaml');
	require('codemirror/mode/shell/shell');
	require('codemirror/mode/commonlisp/commonlisp');
	require('codemirror/mode/clojure/clojure');
	require('codemirror/mode/meta');
	require('../codemirror/piledmap');

	export default {
		name: 'codemirror',
		props: {
			'note': Object,
			'isFullScreen': Boolean,
			'isPreview': Boolean,
			'togglePreview': Function,
			'search': String
		},
		mounted() {
			this.$nextTick(() => {

				var cm = CodeMirror(this.$el, {
					mode: 'piledmd',
					lineNumbers: false,
					lineWrapping: true,
					theme: "default",
					keyMap: 'piledmap',
					indentUnit: 4,
					smartIndent: true,
					tabSize: 4,
					indentWithTabs: true,
					cursorBlinkRate: 540,
					addModeClass: true,
					autoCloseBrackets: true,
					placeholder: 'Start writing...'
				});
				this.cm = cm;
				this.$root.codeMirror = cm;

				cm.on('change', this.updateNoteBody);
				cm.on('blur', this.updateNoteBeforeSaving);

				cm.on('drop', (cm, event) => {
					if (event.dataTransfer.files.length > 0) {
						var p = cm.coordsChar({ top: event.y, left: event.x });
						cm.setCursor(p);
						this.uploadFiles(cm, event.dataTransfer.files);
					} else {
						return true;
					}
				});

				var isLinkState = (type) => {
					if (!type) {
						return false }
					var types = type.split(' ');
					return (_.includes(types, 'link') ||
						_.includes(types, 'piled-link-href') ||
						_.includes(types, 'link')) && !_.includes(types, 'piled-formatting');
				};
				cm.on('contextmenu', (cm, event) => {
					// Makidng timeout Cause codemirror's contextmenu handler using setTimeout on 50ms or so.
					setTimeout(() => {
						var menu = new Menu();

						menu.append(new MenuItem({
							label: 'Cut',
							accelerator: 'CmdOrCtrl+X',
							click: () => { cutText(cm) }
						}));

						menu.append(new MenuItem({
							label: 'Copy',
							accelerator: 'CmdOrCtrl+C',
							click: () => { copyText(cm) }
						}));

						menu.append(new MenuItem({
							label: 'Paste',
							accelerator: 'CmdOrCtrl+V',
							click: () => { pasteText(cm) }
						}));

						menu.append(new MenuItem({ type: 'separator' }));
						menu.append(new MenuItem({
							label: 'Select All',
							accelerator: 'CmdOrCtrl+A',
							click: () => { selectAllText(cm) }
						}));

						menu.append(new MenuItem({ type: 'separator' }));
						menu.append(new MenuItem({
							label: 'Attach Image',
							accelerator: 'Shift+CmdOrCtrl+A',
							click: () => { this.uploadFile() }
						}));

						var c = cm.getCursor();
						var token = cm.getTokenAt(c, true);
						menu.append(new MenuItem({ type: 'separator' }));
						if (isLinkState(token.type)) {
							var s = cm.getRange({ line: c.line, ch: token.start }, { line: c.line, ch: token.state.overlayPos || token.end });
							s = s.replace(/\)$/, '');
							menu.append(new MenuItem({
								label: 'Copy Link',
								click: () => { clipboard.writeText(s) }
							}));
							menu.append(new MenuItem({
								label: 'Open Link In Browser',
								click: () => { shell.openExternal(s) }
							}));
						} else {
							menu.append(new MenuItem({
								label: 'Copy Link',
								enabled: false
							}));
							menu.append(new MenuItem({
								label: 'Open Link In Browser',
								enabled: false
							}));
						}
						menu.append(new MenuItem({ type: 'separator' }));
						menu.append(new MenuItem({ label: 'Toggle Preview', click: () => { this.togglePreview() } }));
						menu.popup(remote.getCurrentWindow());
					}, 90);
				});

				this.$watch('note', function(value) {
					// When swapped the doc;
					var doc = null;
					if (value.doc) {
						doc = value.doc;
					} else {
						// New doc
						if (value.body) {
							doc = new CodeMirror.Doc(value.body, 'piledmd');
						}
						value.doc = doc;
						cm.focus();
					}
					this.$nextTick(() => { cm.refresh(); });
					setTimeout(() => { cm.refresh(); }, 100);
					if (doc) {
						if(doc.cm) doc.cm = null;
						cm.swapDoc(doc);
					}
				}, { immediate: true });
			});
		},
		methods: {

			uploadFile() {
				var notePaths = dialog.showOpenDialog({
					title: 'Attach Image',
					filters: [{
						name: 'Markdown',
						extensions: [
							'png', 'jpeg', 'jpg', 'bmp',
							'gif', 'tif', 'ico'
						]
					}],
					properties: ['openFile', 'multiSelections']
				});
				if (!notePaths || notePaths.length == 0) {
					return }

				var files = notePaths.map((notePath) => {
					var name = path.basename(notePath);
					return { name: name, path: notePath }
				});
				this.uploadFiles(this.cm, files);
			},
			uploadFiles(cm, files) {
				files = Array.prototype.slice.call(files, 0, 5);
				_.forEach(files, (f) => {
					try {
						var image = Image.fromBinary(f.name, f.path);
					} catch (e) {
						this.$message('error', 'Failed to load and save image', 5000);
						console.log(e);
						return
					}
					cm.doc.replaceRange(
						IMAGE_TAG_TEMP({ filename: f.name, fileurl: image.pilemdURL }),
						cm.doc.getCursor()
					);
					this.$message('info', 'Saved image to ' + image.makeFilePath());
				});
			},
			updateNoteBody: _.debounce(function () {
					this.note.body = this.cm.getValue();
				}, 1000, {
					leading: true,
					trailing: true,
					maxWait: 5000
				}
			),
			updateNoteBeforeSaving() {
				this.note.body = this.cm.getValue();
			},
			runSearch() {
				if(this.note && this.search && this.search.length > 1) {
					this.$nextTick(() => {
						CodeMirror.commands.setSearch(this.cm, this.search);
					});
				} else {
					CodeMirror.commands.undoSearch(this.cm);
				}
			}
		},
		watch: {
			isFullScreen() {
				this.$nextTick(() => {
					setTimeout(() => {
						this.cm.refresh();
						this.cm.focus();
					}, 300);
				});
			},
			isPreview() {
				if (!this.isPreview) {
					this.$nextTick(() => {
						this.cm.refresh();
						this.cm.focus();
					});
				}
			},
			note() {
				this.runSearch();
			},
			search() {
				this.runSearch();
			}
		}
	}
</script>