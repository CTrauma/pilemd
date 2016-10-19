const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const _ = require('lodash');
const moment = require('moment');
const Datauri = require('datauri');

const arr = require('./utils/arr');
const uid = require('./utils/uid');
const util_file = require('./utils/file');

const BASE_LIB_PATH_KEY = 'libpath';

function setBaseLibraryPath(path) {
	return localStorage.setItem(BASE_LIB_PATH_KEY, path);
}

function getBaseLibraryPath() {
	return localStorage.getItem(BASE_LIB_PATH_KEY);
}

function readLibrary(){
	var valid_formats = [ '.md', '.markdown', '.txt' ];
	var valid_racks = [],
		valid_folders = [],
		valid_notes = [];

	var racks = fs.readdirSync(getBaseLibraryPath());
	for(var ri = 0; ri<racks.length; ri++){
		try{
			var rack = racks[ri];
			var rackStat = fs.statSync(path.join( getBaseLibraryPath(), rack));
			if(rackStat.isDirectory()){
				var current_rack = new Rack({
					name: rack,
					ordering: valid_racks.length,
					load_ordering: true,
					path: path.join( getBaseLibraryPath(), rack)
				});
				valid_racks.push(current_rack);

				var folders = fs.readdirSync(current_rack.data.path);
				var folders_count = 0;
				for(var fi = 0; fi<folders.length; fi++){
					try{
						var folder = folders[fi];
						var folderStat = fs.statSync(path.join( current_rack.data.path, folder));
						if(folderStat.isDirectory()){
							var current_folder = new Folder({
								name: folder,
								ordering: valid_folders.length,
								load_ordering: true,
								path: path.join( current_rack.data.path, folder),
								rack: current_rack
							});
							valid_folders.push(current_folder);
							folders_count += 1;
							//current_rack.folders.push(current_folder);
							var notes = fs.readdirSync(current_folder.data.path);
							for(var ni = 0; ni<notes.length; ni++){
								try{
									var note = notes[ni];
									var notePath = path.join( current_folder.data.path, note);
									var noteStat = fs.statSync(notePath);
									var noteExt = path.extname(note);
									if(noteStat.isFile() && valid_formats.indexOf(noteExt) >= 0 ){
										valid_notes.push(new Note({
											name: note,
											body: "", //fs.readFileSync(notePath).toString(),
											path: notePath,
											extension: noteExt,
											rack: current_rack,
											folder: current_folder,
											created_at: noteStat.birthtime,
											updated_at: noteStat.mtime
										}));
									}
								} catch(e){ }
							}
						}
					} catch(e){ }
				}
			}

		} catch(e){ }
	}

	return {
		'racks' : valid_racks,
		'folders': valid_folders,
		'notes' : valid_notes,
	}
}

class Model {
	constructor(data) {
		this.uid = data.uid || uid.timeUID();
	}

	get data() { return { uid: this.uid } }

	update(data) {
		this.uid = data.uid;
	}
}

Model.storagePrefix = 'models';

class Note extends Model {
	constructor(data) {
		super(data);

		this._ext = data.extension || ".md";
		
		var re = new RegExp("\\"+this._ext+"$");

		this._name = data.name.replace(re, '');
		this._body = data.body.replace(/    /g, '\t');
		this._path = data.path;
		this._rack = data.rack;
		this._folder = data.folder;

		this.folderUid = data.folder ? data.folder.data.uid : null;
		this.doc = null;
		//this.qiitaURL = data.qiitaURL || null;

		if (data.updated_at) {
			this.updatedAt = moment(data.updated_at);
		} else {
			this.updatedAt = moment();
		}
		if (data.created_at) {
			this.createdAt = moment(data.created_at);
		} else {
			this.createdAt = moment();
		}
	}

	get data() {
		return _.assign(super.data, {
			body: this._body,
			path: this._path,
			extension: this._ext,
			document_filename: this.document_filename,
			folderUid: this.folderUid,
			updated_at: this.updatedAt,
			created_at: this.createdAt,
			rack: this._rack,
			folder: this._folder,
			qiitaURL: this.qiitaURL
		})
	}

	set path(newValue) {
		if(newValue != this._path){
			try{
				if(fs.existsSync(this._path)){
					fs.unlink(this._path);
				}
			} catch(e){
				// it's ok
			}
			this._path = newValue;
		}
	}

	get path() {
		if(this._path && fs.existsSync(this._path)){
			return this._path;
		} else {
			var new_path = path.join( getBaseLibraryPath(), this._rack.data.fsName, this._folder.data.fsName, this.document_filename)+this._ext;
			console.log(new_path);
			return new_path;
		}
	}

	get document_filename() {
		return this.title ? this.title.replace(/[^\w _-]/g, '').substr(0, 40) : "";
	}

	get body() {
		return this._body;
	}

	set body(newValue) {
		if (newValue != this._body) {
			this._body = newValue;
			this.updatedAt = moment();
		}
	}

	set folder(f) {
		if(!f){ return; }

		if(f.folderExists){
			this._rack = f.data.rack;
			this._folder = f;
			this.folderUid = f.uid;
		}
	}

	loadBody() {
		if(fs.existsSync(this.path)){
			var content = fs.readFileSync(this.path).toString();
			content = content.replace(/    /g, '\t');
			if(content && content != this._body){
				this._body = content;
			}
		}
	}

	update(data) {
		super.update(data);

		this._body = data.body;
		this.folderUid = data.folderUid;
		this.updated_at = data.updated_at;
		this.created_at = data.created_at;
	}

	splitTitleFromBody() {
		var ret;
		var lines = this.body.split('\n');
		lines.forEach((row, index) => {
			if (ret) {return}
			if (row.length > 0) {
				ret = {
					title: _.trimLeft(row, '# '),
					body: lines.slice(0, index).concat(lines.splice(index+1)).join('\n')
				};
			}
		});

		if(ret){
			return ret;
		}
		
		return {
			title: "",
			body: this.body
		}
	}

	get bodyWithoutTitle() {
		if(this.body){
			return this.splitTitleFromBody().body.replace(/^\n/, "");
		} else {
			return "";
		}	
	}

	get title() {
		if(this.body){
			return this.splitTitleFromBody().title || this._name;
		} else {
			return this._name;
		}
	}

	get bodyWithDataURL() {
		return this.body.replace(
			/!\[(.*?)]\((pilemd:\/\/.*?)\)/mg,
			(match, p1, p2, offset, string) => {
				try {
					var dataURL = new Image(p2).convertDataURL();
				} catch (e) {
					console.log(e);
					return match
				}
				return '![' + p1 + ']' + '(' + dataURL + ')';
			}
		);
	}

	get img() {
		var matched = /(https?|pilemd):\/\/[-a-zA-Z0-9@:%_\+.~#?&//=]+?\.(png|jpeg|jpg|gif)/.exec(this.body);
		if (!matched) {
			return null
		} else {
			if (matched[1] == 'http' || matched[1] == 'https') {
				return matched[0]
			} else {
				try {
					var dataUrl = new Image(matched[0]).convertDataURL()
				} catch (e) {
					return null
				}
				return dataUrl
			}
		}
	}

	static latestUpdatedNote(notes) {
		return _.max(notes, function(n) { return n.updatedAt } );
	}

	static beforeNote(notes, note, property) {
		var sorted = arr.sortBy(notes, property);
		var before = sorted[sorted.indexOf(note)+1];
		if (!before) {
			// The note was latest one;
			return sorted.slice(-2)[0];
		} else {
			return before;
		}
	}

	static newEmptyNote(folder) {
		if(folder){
			return new Note({
				name: "NewNote",
				body: "",
				path: "",
				rack: folder.data.rack,
				folder: folder,
				folderUid: folder.uid
			});
		} else {
			return false;
		}
	}

	static setModel(model) {
		if(!model){ return }

		var outer_folder = path.join( getBaseLibraryPath(), model.data.rack.data.fsName, model.data.folder.data.fsName );
		//path.dirname(model.data.path);
		if(model.data.document_filename){
			var new_path = path.join(outer_folder, model.data.document_filename) + model.data.extension;

			if(new_path != model.data.path){
				var num = 1;
				while(num > 0){
					try{
						fs.statSync(new_path);
						if( model.data.body && model.data.body != fs.readFileSync(new_path).toString() ){
							new_path = path.join(outer_folder, model.data.document_filename)+num+model.data.extension;
						} else {
							new_path = null;
							break;
						}
					} catch(e){
						break; //path doesn't exist, I don't have to worry about overwriting something
					}
				}

				if(new_path && model.data.body.length > 0){
					console.log('>> Note Save', new_path);
					fs.writeFileSync(new_path, model.data.body);
					model.path = new_path;
				}
			} else {
				if( model.data.body.length > 0 && model.data.body != fs.readFileSync(new_path).toString() ){
					console.log('>> Note Save', new_path);
					fs.writeFileSync(new_path, model.data.body);
				}
			}
		}
	}

	static removeModelFromStorage(model) {
		if (!model) { return }
		if(fs.existsSync(model.data.path)) {
			fs.unlink(model.data.path);
		}
	}
}
Note.storagePrefix = 'notes';


class Folder extends Model {
	constructor(data) {
		super(data);

		this.name = data.name.replace(/^\d+\. /, "") || '';
		this.ordering = false;

		if(data.load_ordering && fs.existsSync(path.join(data.path, '.folder')) ){
			this.ordering = parseInt( fs.readFileSync( path.join(data.path, '.folder') ).toString() );
		}

		if(this.ordering === false || this.ordering === NaN){
			this.ordering = data.ordering || 0;
		}

		this.rackUid = data.rack ? data.rack.data.uid : null;
		this._rack = data.rack;
		this._path = data.path || '';
		this.dragHover = false;
		this.sortUpper = false;
		this.sortLower = false;
	}

	remove(origNotes) {
		origNotes.forEach((note) => {
			if (note.folderUid == this.uid) {
				Note.removeModelFromStorage(note);
			}
		});
		Folder.removeModelFromStorage(this);
	}

	get data() {
		return _.assign(super.data, {
			name: this.name,
			fsName: this.name ? this.name.replace(/[^\w _-]/g, '') : '',
			ordering: this.ordering,
			rack: this._rack,
			rackUid: this.rackUid,
			path: this._path
		});
	}

	set path(newValue) {
		if(newValue != this._path){
			this._path = newValue;
		}
	}

	get folderExists() {
		return fs.existsSync(this._path);
	}

	update(data) {
		super.update(data);
		this.name = data.name;
		this.rackUid = data.rackUid;
		this.ordering = data.ordering;
	}

	saveOrdering() {
		var folderConfigPath = path.join( this._path, '.folder');
		fs.writeFileSync(folderConfigPath, this.ordering);
	}

	static setModel(model) {
		if (!model || !model.data.name) { return }

		var new_path = path.join( getBaseLibraryPath(), model.data.rack.data.fsName, model.data.fsName );
		if(new_path != model.data.path || !fs.existsSync(new_path) ) {
			try{
				if(model.data.path && fs.existsSync(model.data.path)) {
					util_file.moveFolderRecursiveSync(model.data.path,
						path.join( getBaseLibraryPath(), model.data.rack.data.fsName ),model.data.fsName);

				} else {
					fs.mkdirSync(new_path);
				}
				model.path = new_path;
			} catch(e){
				return console.error(e);
			}
		}
		model.saveOrdering();
	}

	static removeModelFromStorage(model) {
		if (!model) { return }
		if(fs.existsSync(model.data.path)) {
			fs.rmdirSync(model.data.path);
		}
	}
}
Folder.storagePrefix = 'folders';


class Rack extends Model {
	constructor(data) {

		super(data);

		this.name = data.name.replace(/^\d+\. /, "") || '';

		this.ordering = false;

		if(data.load_ordering && fs.existsSync(path.join(data.path, '.rack')) ){
			this.ordering = parseInt( fs.readFileSync( path.join(data.path, '.rack') ).toString() );
		}

		if(this.ordering === false || this.ordering === NaN){
			this.ordering = data.ordering || 0;
		}

		this._path = data.path;
		this.dragHover = false;
		this.sortUpper = false;
		this.sortLower = false;
		this.openFolders = false;

		this.folders = [];
		this.notes = [];
	}

	get data() {
		return _.assign(super.data, {
			name: this.name,
			fsName: this.name ? this.name.replace(/[^\w _-]/g, '') : '',
			ordering: this.ordering,
			path: this._path,
		});
	}

	set path(newValue) {
		if(newValue != this._path){
			this._path = newValue;
		}
	}

	update(data) {
		super.update(data);
		this.name = data.name;
		this.ordering = data.ordering;
	}

	remove(origNotes, origFolders) {
		origFolders.forEach((folder) => {
			if (folder.rackUid == this.uid) {
				folder.remove(origNotes);
			}
		});
		Rack.removeModelFromStorage(this);
	}

	saveOrdering() {
		var rackConfigPath = path.join( this._path, '.rack');
		fs.writeFileSync(rackConfigPath, this.ordering);
	}

	static setModel(model) {
		if (!model || !model.data.name) { return }

		var new_path = path.join( getBaseLibraryPath(), model.data.fsName );
		if(new_path != model.data.path || !fs.existsSync(new_path) ) {
			try{
				if(model.data.path && fs.existsSync(model.data.path)) {
					util_file.moveFolderRecursiveSync(model.data.path, getBaseLibraryPath(), model.data.fsName);
				} else {
					fs.mkdirSync(new_path);
				}
				model.path = new_path;
			} catch(e){
				return console.error(e);
			}
		}
		model.saveOrdering();
	}
}
Rack.storagePrefix = 'racks';


const CLASS_MAPPER = {
	notes: Note,
	folders: Folder,
	racks: Rack
};

function makeWatcher(racks, folders, notes) {
	var arrayMapper = {
		racks: racks,
		folders: folders,
		notes: notes
	};
	var watcher = chokidar.watch([], {
		depth: 1,
		ignoreInitial: true
	});
	watcher.on('add', (path) => {
		var d = readDataFile(path);
		if (!d) {return}
		if (!arrayMapper[d.dataType].find(uidFinder(d.uid))) {
			arrayMapper[d.dataType].push(new CLASS_MAPPER[d.dataType](d.data));
		}
	});
	watcher.on('change', (path) => {
		var d = readDataFile(path);
		if (!d) {return}
		var target = arrayMapper[d.dataType].find(uidFinder(d.uid));
		if (target) {
			target.update(d.data);
		}
	});
	/*
	watcher.on('unlink', (path) => {
		var d = detectPath(path);
		if (!d) {return}
		arr.remove(arrayMapper[d.dataType], uidFinder(d.uid));
	});
	*/
	watcher.add(getBaseLibraryPath());
	return watcher;
}

class Image {

	constructor (pilemdURL) {
		if (!pilemdURL.startsWith('pilemd://images/')) {
			throw "Incorrect Image URL"
		}
		this.pilemdURL = pilemdURL
	}

	makeFilePath() {
		var p = this.pilemdURL.slice(9);
		var basePath = getBaseLibraryPath();
		if (!basePath || basePath.length == 0) throw "Invalid Base Path";
		return path.join(getBaseLibraryPath(), p)
	}

	convertDataURL() {
		return Datauri.sync(this.makeFilePath());
	}

	static appendSuffix(filePath) {
		var c = 'abcdefghijklmnopqrstuvwxyz';
		var r = '';
		for (var i = 0; i < 8; i++) {
			r += c[Math.floor(Math.random() * c.length)];
		}
		var e = path.extname(filePath);
		if (e.length > 0) {
			return filePath.slice(0, -e.length) + '_' + r + e
		} else {
			return filePath + '_' + r
		}
	}

	static fromBinary(name, frompath) {
		// Try creating images dir.
		var dirPath = path.join(getBaseLibraryPath(), 'images');
		try {fs.mkdirSync(dirPath)} catch (e) {}

		var savePath = path.join(dirPath, name);
		// Check exists or not.
		try {
			var fd = fs.openSync(savePath, 'r');
			if (fd) {fs.close(fd)}
			name = this.appendSuffix(name);
			savePath = path.join(dirPath, name);
		} catch(e) {}  // If not exists
		fs.writeFileSync(savePath, fs.readFileSync(frompath));
		var relativePath = path.join('images', name);
		return new this('pilemd://' + relativePath);
	}
}


module.exports = {
	Note: Note,
	Folder: Folder,
	Rack: Rack,
	getBaseLibraryPath: getBaseLibraryPath,
	setBaseLibraryPath: setBaseLibraryPath,
	readLibrary: readLibrary,
	makeWatcher: makeWatcher,
	Image: Image
};
