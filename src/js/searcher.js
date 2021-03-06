const _ = require('lodash');
const models = require('./models');

/**
 * @function allWords
 * @param  {String} text  The Text
 * @param  {Array} words  Array of words
 * @return {Boolean} True if all words are inside the text
 */
function allWords(text, words) {
	/*
	 * allWords("Hello Goodbye", ["ell", "oo"]) => true
	 * allWords("Hi Goodbye", ["ell", "oo"]) => false
	 */
	return _.every(_.map(words, (word) => {
		return _.includes(text, word);
	}));
}

module.exports = {
	/**
	 * @function searchNotes
	 * @param {Object} selectedRackOrFolder Current selected rack or folder
	 * @param {String} searchInput Search string
	 * @param {Array} notes Array of notes
	 * @return {Array} Filtered notes using search input
	 */
	searchNotes(selectedRackOrFolder, searchInput, notes) {
		if (selectedRackOrFolder === null || selectedRackOrFolder === undefined) {
			return [];
		}
		var searchPayload = this.calculateSearchMeaning(selectedRackOrFolder, searchInput);
		var filteredNotes = notes.filter((note) => {
			if (!searchPayload.folderUids || _.includes(searchPayload.folderUids, note.folderUid)) {
				if (searchPayload.words.length == 0) return true;
				if (!note.body && note.loadBody) note.loadBody();
				if (note.body && allWords(note.body.toLowerCase(), searchPayload.words)) return true;
			}
			return false;
		});
		return filteredNotes;
	},

	/**
	 * @function calculateSearchMeaning
	 * @param {Object} selectedRackOrFolder Current selected rack or folder
	 * @param {String} searchInput Search string
	 * @return {Object} Search payload with list of folder uids and list of words in search string
	 */
	calculateSearchMeaning(selectedRackOrFolder, searchInput) {
		var words = searchInput.toLowerCase().split(' ');
		var folderUids;
		if (selectedRackOrFolder === null || selectedRackOrFolder === undefined) {
			folderUids = null;
		} else if (selectedRackOrFolder instanceof models.Rack) {
			folderUids = selectedRackOrFolder.folders.map((f) => {
				return f.uid;
			});
		} else {
			folderUids = [selectedRackOrFolder.uid];
		}

		return {
			folderUids: folderUids,
			words: words
		};
	}
};
