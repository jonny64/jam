var casper = init_casper ();

login (casper);

navigate_notes_page (casper);

var all_notes = [];

function add_notes(casper){
	var raw_page_notes = casper.evaluate(function(){
		var notes = $('#allnotes').dataTable();
		return notes.fnGetData();
	});

	var page_notes = parse_notes (raw_page_notes, casper);

	return page_notes;
}

function pushbullet_notify(page_notes, casper){

	var body = '';
	for (var i in page_notes) {
		var note = page_notes [i];
		body = body + note.rating + ' ' + note.yield + ' %'
		+ '\nprice\t\t' + note.price
		+ '\nremaining\t' + note.remaining
		+ '\npayments\t' + note.payments
		+ '\ndays\t\t' + note.days
		+ '\n' + note.url;
		body = body + '\n\n';
	}

	if (page_notes.length) {
		pushbullet({
			body  : body,
			title : page_notes.length + ' new notes found '
		}, casper);
	}
};

casper.then(function(){

	var inner_notes = all_notes;

	casper.repeat(4, function(){
		var that_notes = inner_notes;
		this.renderJSON(that_notes);

		casper.then(function(){
			that_notes = that_notes.concat(add_notes(this));
		});

		casper.then(function(){
			this.evaluate(function(){
				$('.paginate_button.active').next().trigger('click');
			});
		}).wait(6000);
	});
	this.renderJSON(inner_notes);
});

casper.then(function(){
	this.renderJSON(all_notes);
	pushbullet_notify(all_notes, this);
});


casper.run();
casper.viewport(1980, 1080);

function parse_notes(raw_page_notes, casper) {

	var page_notes = [];

	for (var i in raw_page_notes) {

		var note = raw_page_notes [i];

		var payments = listing_payment_cnt(note[3]);
		if (payments === -1) { // default
			continue;
		}

		var yield = parseFloat(note [6].replace(/\%\s*/, ''));
		if (!yield) {
			yield = note [6];
		}

		if (casper.config.skip.funding && yield == 'N/A') {
			continue;
		}

		if (yield < (casper.config.skip.yield || 500)) {
			continue;
		}

		var rating = listing_rating(note[0]);
		if (rating === casper.config.skip.rating) {
			continue;
		}

		var hours_left = note_hours_left (note [7]);
		if (hours_left < (casper.config.skip.hours || 120)) { // only new notes 5, 6 and 7 days left
			continue;
		}

		var url = listing_link(note [1]);

		page_notes.push({
			rating    : rating,
			url       : url,
			payments  : payments,
			days      : hours_left / 24,
			remaining : parseFloat(note [4].replace(/^\D/, '')),
			price     : parseFloat(note [5].replace(/^\D/, '')),
			yield     : yield
		});
	}

	page_notes = page_notes.sort(function(a, b){return b.price - a.price});

	return page_notes;
}

function note_hours_left(html){
	var info_regex = /(\d+) ((days|hours)) Left/i;
	var m = info_regex.exec(html);
	if (m && m.length) {
		var hours = parseInt(m[1]);
		if (!hours) {
			return -1;
		}
		if (m [2] === 'days') {
			hours = hours * 24;
		}
		return hours;
	}
	return -1;
}

function listing_rating(html) {

	var info_regex = /cr-label.*\>\s*(\w)\s*\</g;
	var m = info_regex.exec(html);
	if (m && m.length) {
		return m [1];
	}
	return html;
}

function listing_payment_cnt(html) {

	if (html.indexOf('default') > -1) {
		return -1;
	}

	var info_regex = /(\d+)/g;
	var m = info_regex.exec(html);
	if (m && m.length) {
		return parseInt(m [1]);
	}
	return 0;
}

function listing_link(html) {
	var info_regex = /\d+/g;
	var m = info_regex.exec(html);
	if (m && m.length) {
		return 'http://btcjamtop.com/Listings/Inspect/' + m [0];
	}
	return '';
}

function init_casper() {

	var casper = require('casper').create({
		verbose: true,
		logLevel: 'debug',
		pageSettings: {
			userAgent: 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36'
		}
	});

	// print out all the messages in the headless browser context
	casper.on('remote.message', function(msg) {
		this.echo('remote message caught: ' + msg);
	});

	// print out all the messages in the headless browser context
	casper.on("page.error", function(msg, trace) {
		this.echo("Page Error: " + msg, "ERROR");
	});


	casper.renderJSON = function(what) {
		return this.echo(JSON.stringify(what, null, '  '));
	};

	var fs = require('fs');
	var config_file = fs.read('btcjam.json');
	casper.config = JSON.parse(config_file) || {};

	return casper;
}

function login(casper) {
	casper.start(casper.config.url, function login_facebook() {

		if (casper.config.debug) {
			this.captureSelector('before_login.png', 'html');
		}

		casper.waitForSelector('#user_email', function fill_login_form() {
			this.fill('form#new_user', { 'user[email]': casper.config.user, 'user[password]': casper.config.password }, true);
		});
	}, function error_popup(){
		this.captureSelector('error_login.png', 'html');
	}, 15000);

	if (casper.config.debug) {
		casper.then(function after_submit(){
			this.captureSelector('logged_on.png', 'html');
		});
	}
}

function navigate_notes_page(casper) {

	casper.thenOpen('https://btcjam.com/notes', function() {
		console.log(this.getTitle() + '\n');
	});

	casper.wait(2000);

	casper.then(function(){
		this.evaluate(function(){
			$('select[name=allnotes_length]').val(100);
			return $('select[name=allnotes_length]').trigger('change');
		});
	})


	var invested_sort = 'th[aria-label*=Invested]';
	casper.waitForSelector(invested_sort).thenClick(invested_sort);
	casper.wait(5000).thenClick(invested_sort).wait(5000);

	if (casper.config.debug) {
		casper.then(function screen(){
			this.captureSelector('notes.png', 'html');
		});
	}

}

function pushbullet(options, casper) {

	var TARGET_EMAIL = casper.config.pushbullet.email;
	var API_KEY = casper.config.pushbullet.api_key;
	options["email"] = TARGET_EMAIL;
	options["type"]  = options.type || "note";
	options["url"]   = options.url || "";
	options["title"] = options.title || "";
	options["body"]  = options.body || "";

	casper.open("https://api.pushbullet.com/v2/pushes", {
		method: 'post',
		data:   JSON.stringify (options),
		headers: {
			'Content-type': 'application/json',
			'Accept': 'application/json',
			"Authorization": "Bearer " + API_KEY
		}
	}, function(response){
		if(response.status == 200){
			require('utils').dump(this.page.content);
		}
	});

}
