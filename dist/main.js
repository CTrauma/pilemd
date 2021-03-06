const electron = require('electron');
const fs = require('fs');
const path = require('path');
const { app, Tray, BrowserWindow, Menu, ipcMain } = electron;

const { download } = require('electron-dl');

var mainWindow = null;
var appIcon = null;

var shouldQuit = app.makeSingleInstance(function(commandLine, workingDirectory) {
	// someone tried to run a second instance, we should focus our window.
	if (mainWindow) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	}
});

/**
 * @function makeWindow
 * @return {Void} Function doesn't return anything
 */
function makeWindow() {

	var settings_path = path.join(electron.app.getPath('appData'), 'pilemdConfig.json');
	var settings_data = null;
	try {
		settings_data = JSON.parse(fs.readFileSync(settings_path));
	} catch (e) {
		settings_data = {};
	}

	var WINDOW_WIDTH = settings_data['screen_width'] || 1024;
	var WINDOW_HEIGHT = settings_data['screen_height'] || 768;
	var WINDOW_CENTER = true;
	var WINDOW_X;
	var WINDOW_Y;

	if (process.platform == 'linux') {
		let bounds = electron.screen.getPrimaryDisplay().bounds;
		WINDOW_X = bounds.x + ((bounds.width - WINDOW_WIDTH) / 2);
		WINDOW_Y = bounds.y + ((bounds.height - WINDOW_HEIGHT) / 2);
		WINDOW_CENTER = false;
	}

	// create the browser window.
	var conf = {
		width: WINDOW_WIDTH,
		height: WINDOW_HEIGHT,
		x: WINDOW_X,
		y: WINDOW_Y,
		minWidth: 270,
		minHeight: 437,
		center: WINDOW_CENTER,
		title: 'PileMd',
		backgroundColor: '#36393e',
		show: false,
		darkTheme: true,
		tabbingIdentifier: 'pilemd',
		titleBarStyle: 'hidden',
		frame: false,
		webPreferences: {
			devTools: true,
			webgl: false,
			webaudio: false
		}
	};

	if (process.platform == 'linux') {
		conf['icon'] = __dirname + '/icon.png';
	}

	mainWindow = new BrowserWindow(conf);
	mainWindow.setMenu(null);
	mainWindow.loadURL('file://' + __dirname + '/index.html');
	mainWindow.setContentProtection(true);

	appIcon = new Tray(__dirname + '/icon.png');
	var contextMenu = Menu.buildFromTemplate([{
		label: 'Show App',
		click: function() {
			mainWindow.show();
		}
	},{
		label: 'Quit',
		click: function() {
			app.isQuiting = true;
			app.quit();
		}
	}]);
	appIcon.setToolTip(conf.title);
	appIcon.setContextMenu(contextMenu);
	appIcon.setHighlightMode('always');
	appIcon.on('click', function() {
		if (mainWindow.isVisible()) {
			mainWindow.hide();
		} else {
			mainWindow.show();
		}
	});

	global.appIcon = appIcon;
	global.isLinux = process.platform == 'linux';
	global.argv = process.argv;

	// open the DevTools.
	// mainWindow.webContents.openDevTools();

	mainWindow.webContents.on('will-navigate', (e, url) => {
		e.preventDefault();
		electron.shell.openExternal(url);
	});

	// emitted when the window is closed.
	mainWindow.on('closed', () => {
		// dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		mainWindow = null;
	});

	mainWindow.once('ready-to-show', () => {
		mainWindow.show();
		mainWindow.focus();
	});
}

if (shouldQuit) {
	app.quit();
} else {

	const APP_NAME = app.getName();
	const DARWIN_ALL_CLOSED_MENU = [
		{
			label: APP_NAME,
			submenu: [
				{
					label: 'About ' + APP_NAME,
					role: 'about'
				},
				{ type: 'separator' },
				{
					label: 'Services',
					role: 'services',
					submenu: []
				},
				{ type: 'separator' },
				{
					label: 'Hide ' + APP_NAME,
					accelerator: 'Command+H',
					role: 'hide'
				},
				{
					label: 'Hide Others',
					accelerator: 'Command+Shift+H',
					role: 'hideothers'
				},
				{
					label: 'Show All',
					role: 'unhide'
				},
				{ type: 'separator' },
				{
					label: 'Quit ' + APP_NAME,
					accelerator: 'Command+Q',
					click: function() {
						app.quit();
					}
				}
			]
		},
		{
			label: 'File',
			submenu: [
				{
					label: 'New ' + APP_NAME + ' Window',
					click: makeWindow
				}
			]
		}
	];

	// quit when all windows are closed.
	app.on('window-all-closed', () => {
		// on OS X it is common for applications and their menu bar
		// to stay active until the user quits explicitly with Cmd + Q
		if (process.platform != 'darwin') {
			app.quit();
		} else {
			Menu.setApplicationMenu(Menu.buildFromTemplate(DARWIN_ALL_CLOSED_MENU));
		}
	});

	ipcMain.on('download-btn', (e, args) => {
		download(BrowserWindow.getFocusedWindow(), args.url, args.options).then((dl) => {
			console.log('Saved to '+ dl.getSavePath());
		}).catch(console.error);
	});

	// this method will be called when Electron has finished
	// initialization and is ready to create browser windows.
	app.on('ready', () => {
		makeWindow();
	});

	app.on('activate', () => {
		if(!mainWindow){
			makeWindow();
		} else {
			mainWindow.show();
		}
	});
}
