const _ = require('lodash');

const imageFile = require('../utils/imageFile');
const ApplicationMenu = require('../applicationmenu').ApplicationMenu;

const electron = require('electron');
const remote = electron.remote;
const Menu = remote.Menu;
const MenuItem = remote.MenuItem;
const shell = electron.shell;
const dialog = remote.dialog;
const applicationmenu = require('../applicationmenu');

const clipboard = electron.clipboard;
const elutils = require('../codemirror/elutils');
const copyText = elutils.copyText;
const cutText = elutils.cutText;
const pasteText = elutils.pasteText;

const IMAGE_UPLOADING_TEMP = _.template('![Uploading <%- filename %>...]()\n');
const IMAGE_TAG_TEMP = _.template('![<%- filename %>](<%- fileurl %>)\n');

module.exports = function(Vue, options) {

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
  require('codemirror/mode/css/css');
  require('codemirror/mode/htmlmixed/htmlmixed');
  require('codemirror/mode/clike/clike');
  require('codemirror/mode/http/http');
  require('codemirror/mode/ruby/ruby');
  require('codemirror/mode/php/php');
  require('codemirror/mode/perl/perl');
  require('codemirror/mode/swift/swift');
  require('codemirror/mode/go/go');
  require('codemirror/mode/sql/sql');
  require('codemirror/mode/yaml/yaml');
  require('codemirror/mode/commonlisp/commonlisp');
  require('codemirror/mode/clojure/clojure');
  require('codemirror/mode/meta');
  require('../codemirror/piledmap');

  Vue.use(require('vue-resource'));

  var imageResource = Vue.resource(options.imageURL);

  function uploadFiles(cm, files, vm) {
    files = Array.prototype.slice.call(files, 0, 5);
    _.forEach(files, (f) => {
      /* Before Upload
       * Insert `Uploading` text */
      var uploadingText = IMAGE_UPLOADING_TEMP({filename: f.name});
      cm.doc.replaceRange(uploadingText, cm.doc.getCursor());

      /* Uploading */
      imageResource.save({}, f).then((d) => {
        /* After Upload
         * Replace `Uploading` text by img tag */
        var cursor = cm.getSearchCursor(uploadingText);
        if (cursor.findNext()) {
          cursor.replace(IMAGE_TAG_TEMP({filename: f.name, fileurl: d.data.image}));
        } else {
          /* When `Uploading` text doesn't exist, some how. */
          vm.$message(
            'error', "Can't detect place to put the image URL",
            5000
          )
        }
      }, (d) => {
        if (d.status == 413) {
          vm.$message(
            'error', 'Upload failed: Too big file',
            5000);
        } else if (d.data) {
          vm.$message(
            'error', 'Upload failed: ' + (d.data.error || 'Unexpected error'),
            5000);
        } else if (d.status == 0) {
          vm.$message(
            'error', 'Connection Error',
            5000
          )
        }
      });
    });
  }

  /**
   * Component to dender CodeMirror editor
   * It's already customized for editing page of piled.
   */
  Vue.component('codemirror', {
    replace: false,
    props: ['note', 'isFullScreen', 'isPreview'],
    template: require('./codemirror.html'),
    ready: function () {
      this.$nextTick(() => {

        var cm = CodeMirror(this.$el, {
          mode: 'piledmd',
          lineNumbers: false,
          lineWrapping: true,
          theme: "default",
          keyMap: 'piledmap',
          indentUnit: 4,
          cursorBlinkRate: 540,
          addModeClass: true,
          autoCloseBrackets: true,
          placeholder: 'Start writing Markdown...'
        });
        this.cm = cm;

        var updateBody = Vue.util.debounce(() => {
          this.note.body = cm.getValue();
        }, 300);
        cm.on('change', function() {
          updateBody();
        });
        cm.on('drop', (cm, event) => {
          if (event.dataTransfer.files.length > 0) {
            var p = cm.coordsChar({top: event.y, left: event.x});
            cm.setCursor(p);
            uploadFiles(cm, event.dataTransfer.files, this);
          } else {
            return true;
          }
        });

        // Electron
        // FIXME Fucking hell impl
        var setMenu = () => {
          var menu = new ApplicationMenu();
          menu.setEditSubmenu([
            {
              label: 'Undo',
              accelerator: 'CmdOrCtrl+Z',
              click: () => { cm.execCommand('undo') }
            },
            {
              label: 'Redo',
              accelerator: 'Alt+Z',
              click: () => { cm.execCommand('redo') }
            },
            {
              type: 'separator'
            },
            {
              label: 'Cut',
              accelerator: 'CmdOrCtrl+X',
              role: 'cut'
            },
            {
              label: 'Copy',
              accelerator: 'CmdOrCtrl+C',
              role: 'copy'
            },
            {
              label: 'Paste',
              accelerator: 'CmdOrCtrl+V',
              role: 'paste'
            },
            {
              label: 'Select All',
              accelerator: (function() {
                if (applicationmenu.IS_DARWIN) {
                  return 'Command+A'
                } else {
                  return 'Shift+Ctrl+A'
                }
              })(),
              click: () => { cm.execCommand('selectAll') }
            },
            {
              type: 'separator'
            },
            {
              label: 'Upload Image...',
              accelerator: (function() {
                if (applicationmenu.IS_DARWIN) {
                  return 'Shift+Command+A'
                } else {
                  return 'Shift+Alt+A'
                }
              })(),
              click: () => {
                this.uploadFile()
              }
            },
            {
              type: 'separator'
            },
            {
              label: 'Find...',
              accelerator: (function() {
                if (applicationmenu.IS_DARWIN) {
                  return 'Command+F'
                } else {
                  return 'Ctrl+S'
                }
              })(),
              click: () => { cm.execCommand('findPersistent') }
            },
            {
              label: 'Replace...',
              accelerator: (function() {
                if (applicationmenu.IS_DARWIN) {
                  return 'Alt+Command+F'
                } else {
                  return 'Ctrl+R'
                }
              })(),
              click: () => { cm.execCommand('replace') }
            }
          ]);
          menu.setMenu();
        };
        setMenu();

        var isLinkState = (type) => {
          if (!type) {return false}
          var types = type.split(' ');
          return (_.includes(types, 'link') ||
            _.includes(types, 'piled-link-href') ||
            _.includes(types, 'link')) && !_.includes(types, 'piled-formatting');
        };
        cm.on('contextmenu', (cm, event) => {
          // Makidng timeout Cause codemirror's contextmenu handler using setTimeout on 50ms or so.
          setTimeout(() => {
            var menu = new Menu();
            menu.append(new MenuItem({label: 'Cut', accelerator: 'CmdOrCtrl+X',
              click: () => {cutText(cm)}}));
            menu.append(new MenuItem({label: 'Copy', accelerator: 'CmdOrCtrl+C',
              click: () => {copyText(cm)}}));
            menu.append(new MenuItem({label: 'Paste', accelerator: 'CmdOrCtrl+V',
              click: () => {pasteText(cm)}}));
            menu.append(new MenuItem({type: 'separator'}));
            menu.append(new MenuItem({label: 'Upload Image', accelerator: 'Shift+CmdOrCtrl+A',
              click: () => {this.uploadFile()}}));
            var c = cm.getCursor();
            var token = cm.getTokenAt(c, true);
            menu.append(new MenuItem({type: 'separator'}));
            if (isLinkState(token.type)) {
              var s = _.trim(cm.getRange(
                {line: c.line, ch: token.start},
                {line: c.line, ch: token.state.overlayPos || token.end}
              ), '[]()!');
              menu.append(new MenuItem({label: 'Copy Link',
                click: () => {clipboard.writeText(s)}}));
              menu.append(new MenuItem({label: 'Open Link In Browser',
                click: () => {shell.openExternal(s)}}));
            } else {
              menu.append(new MenuItem({label: 'Copy Link',
                enabled: false}));
              menu.append(new MenuItem({label: 'Open Link In Browser',
                enabled: false}));
            }
            menu.popup(remote.getCurrentWindow());
          }, 90);
        });

        this.$watch('isFullScreen', () => {
          Vue.nextTick(() => {
            setTimeout(()=>{
              cm.refresh();
              cm.focus();
            }, 300);
          });
        });

        this.$watch('isPreview', (value) => {
          if (!value) {
            Vue.nextTick(() => {
              cm.refresh();
              cm.focus();
              setMenu();
            });
          }
        });

        this.$watch('note', function(value) {
          // When swapped the doc;
          var doc;
          if (value.doc) {
            doc = value.doc;
          } else {
            // New doc
            doc = new CodeMirror.Doc(value.body, 'piledmd');
            value.doc = doc;
            cm.focus();
          }
          Vue.nextTick(() => {
            cm.refresh();
          });
          if (doc.cm) {
            doc.cm = null;
          }
          cm.swapDoc(doc);
        }, { immediate: true });
        this.$watch('note.body', function(value) {
          if (cm.doc.getValue() != value) {
            // Note updated by outers.
            // TODO more correct way to detect the state.
            var c = cm.doc.getCursor();
            cm.doc.setValue(value);
            cm.doc.setCursor(c);
          }
        })
      });
    },
    methods: {
      uploadFile: function() {
        var cm = this.cm;
        var notePaths = dialog.showOpenDialog({
          title: 'Upload Image',
          filters: [{name: 'Markdown', extensions: [
            'png', 'jpeg', 'jpg', 'bmp',
            'gif', 'tif', 'ico'
          ]}],
          properties: ['openFile', 'multiSelections']
        });
        if (!notePaths || notePaths.length == 0) { return }

        var files = notePaths.map((notePath) => {
          return imageFile.pathToFile(notePath);
        });
        uploadFiles(cm, files, this);
      }
    }
  });
};
