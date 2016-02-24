var common = require('./common.js');

var casper = common.init_casper ();

if (!check_notes ('notes.json')) {
	casper.exit();
}

casper.then(function notes_login(){
	common.login (casper, casper.config.user_notes, casper.config.password_notes);
});

navigate_notes_page (casper);

var all_notes;

casper.then(function(){
	all_notes = common.load_json('notes');

	all_notes = buy_notes(all_notes, this);
});

casper.then(function(){

	notify_notes(all_notes, this);

	mark_buy_notes(all_notes, 'notes.json', this)
});

casper.run();
casper.viewport(1980, 1080);

function notify_notes(page_notes, casper){

	var body = '';
	var cnt_bought = 0;
	for (var i in page_notes) {

		var note = page_notes [i];

		if (!note.bought) {
			continue;
		}

		cnt_bought++;

		body = body + note.id + '\n';
	}

	if (cnt_bought == 0) {
		return;
	}

	common.pushbullet({
		body  : body,
		title : 'picked ' + cnt_bought + ' notes'
	}, casper);
};

function check_notes(filename) {
	var fs = require('fs');
	return fs.isFile(filename);
}

function buy_notes(notes, casper) {

require('utils').dump(all_notes);

	var i = 0;

	var processed_notes = [];

	casper.repeat(notes.length, function note_loop(){

		var note = notes [i++];

		if (casper.config.balance > 0 && note.price > casper.config.balance) {
			note.error = 'p ' + note.price + '; b ' + casper.config.balance;
			this.log(note.error, 'error');
			return;
		}

		if (note.yield < 10) {
			note.error = 'too small yield ' + note.yield;
			this.log(note.error, 'error');
			return;
		}

		var buy_url = "https://btcjam.com/notes/" + note.id + "/buy";

		casper.then(function BUY_NOTE() {

   			var data = { _method: 'buy' };
   			var csrf = casper.evaluate(function(){
   				return {
   					param: $('meta[name=csrf-param]').attr("content"),
   					token: $('meta[name=csrf-token]').attr("content")
   				};
   			});
			data[csrf.param] = csrf.token;

			casper.open(buy_url, {
				method: 'post',
				data: data,
				headers: {
					'Content-type': 'application/x-www-form-urlencoded',
					'Accept': 'text/html,application/xhtml+xml,application/xml',
					'X-Requested-With': 'XMLHttpRequest'
				}
			}).then(function BUY_NOTE(response){
				console.log(response.statusText);
				note.status = response.statusText;
				note.bought = response.status == "200";
			});
		});
		processed_notes.push(note);
	});

	return processed_notes;
}

function mark_buy_notes(notes, filename, casper) {
	var fs = require('fs');
	fs.remove(filename);
}

function navigate_notes_page(casper) {

	casper.wait(250).thenOpen('https://btcjam.com/notes', function open_notes_page() {
			console.log(this.getTitle() + '\n');
			casper.config.balance = parseFloat(this.getHTML('.balance-data').replace(/^\s*\D/, ''));
		})
		.waitForResource(/allnotes.json/)
		.wait(500)
	;

	if (casper.config.debug_notes) {
		casper.then(function screen(){
			this.captureSelector('notes.png', 'html');
		});
	}

}
