var casper = init_casper ();

login (casper);

casper.thenOpen(jam_datatables_notes_url (0, 10), jam_datatables_headers(), function notes_page_ping(response){

	var data = JSON.parse(this.getPageContent());

	var is_empty = !data.iTotalRecords || data.iTotalRecords == 0 || !data.aaData[0] || !data.aaData[0].length;

	if (is_empty && is_send_empty_notify ()) {

		pushbullet({
			body  : this.getPageContent(),
			title : 'parsing is possibly broken'
		}, casper);

		casper.log('PARSING BROKEN', 'error');

		casper.bypass(2);
	}
});

var all_notes = [];

navigate_notes_api (casper);

casper.then(function parse_and_sort_notes(){

	all_notes = sort_notes(all_notes);
});

casper.then(function notify_found_notes(){

	if (!all_notes.length) {
		casper.log('NO NEW NOTES FOUND! adjust config', 'warning');

		if (!is_send_empty_notify ()) {
			return;
		}
	}

	require('utils').dump(all_notes);

	write_json(all_notes, 'notes');

	notify_notes(all_notes, this);
});

casper.then(function write_run_flag_step(){
	write_run_flag('btcjam_run');
});

casper.run();
casper.viewport(1980, 1080);

function navigate_notes_api (casper) {

	casper.then(function(){

		var page = 1;

		casper.repeat(casper.config.pages || 15, function(){

			casper.thenOpen(jam_datatables_notes_url ((page - 1) * 100, 100), jam_datatables_headers (), function notes_page_ok(response){
				var data = JSON.parse(this.getPageContent());

				if (casper.config.debug) {
					casper.log('total notes count: ' + data.iTotalRecords);
				}

				// require('utils').dump(data);

				var raw_page_notes = data.aaData;
				all_notes = all_notes.concat(parse_notes(raw_page_notes, this));
			});

			casper.then(function wait_and_open_next_page(){
				page++;
				casper.log('navigate page ' + page, 'warning');
			}).wait(250);
		});

	});
}

function jam_datatables_headers() {

	return {
		method: 'get',
		data:   '',
		headers: {
			'Content-type': 'application/json',
			'Accept': 'application/json, text/javascript, */*; q=0.01',
			'X-Requested-With': 'XMLHttpRequest'
		}
	};
}

function jam_datatables_notes_url (start, length) {

	return "https://btcjam.com/notes/allnotes.json?sEcho=1&iColumns=9&sColumns=,,,,,,,,"
		+ "&iDisplayStart=" + start
		+ "&iDisplayLength=" + length
		+ "&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=false&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=false&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=false&sSearch=&bRegex=false"
		+ "&iSortCol_0=3&sSortDir_0=desc&iSortingCols=1"
		+ "&show_current=true&show_late=true&show_default=false&show_credit_score_a=true&show_credit_score_b=true&show_credit_score_c=true&show_credit_score_d=true&show_credit_score_e=true&filter_yield=0&filter_note_price=0&currency_id=all"
		+ "&_=" + Math.random();
}

function is_send_empty_notify() {

	return !is_run_flag ('btcjam_run');
}


function notify_notes(page_notes, casper){

	var body = '';
	var subject_postfix = ''
	for (var i in page_notes) {

		var note = page_notes [i];

		var grade = /A|B|C/g.exec(note.rating);

		if (grade && grade.length && !subject_postfix) {
			subject_postfix = grade [0];
		}

		body = body + note.rating + ' ' + note.yield + ' % ' + note.borrower
		+ '\nprice\t\t' + note.price
		+ '\nremaining\t' + note.remaining
		+ '\ninvested\t' + note.invested
		+ '\npayments\t' + note.payments
		+ '\nid\t\t' + note.id
		+ '\n' + note.url;
		body = body + '\n\n';
	}

	pushbullet({
		body  : body,
		title : page_notes.length + ' new notes found ' + subject_postfix
	}, casper);
};

function parse_notes(raw_page_notes, casper) {

	var page_notes = [];

	var skip_notes = casper.config.skip.notes.concat(ids(load_json('notes')));

	for (var i in raw_page_notes) {

		var note = raw_page_notes [i];

		var payments = listing_payment_cnt(note[4]);
		if (payments === -1) { // default
			continue;
		}


		var yield = parseFloat(note [7].replace(/\>\s*/, '').replace(/\s*\%\s*/, ''));

		if (!yield) {
			yield = note [7];
		}

		var invested = parseFloat(note [3].replace(/^\s*\D/, ''));
		var price    = parseFloat(note [6].replace(/^\s*\D/, ''));
		var remaining = parseFloat(note [5].replace(/^\s*\D/, ''));

		if (price >= invested - 0.0001 || price >= remaining - 0.0001 || remaining < 0.005) {
			continue
		}

		if (yield == 'N/A') {
			yield = 100 *  (invested / price - 1);
		}

		var rating = listing_rating(note[0]);

		var min_yield = casper.config.skip.yield;
		if (yield < (min_yield [rating] || min_yield["other"] || 500)) {
			continue;
		}


		var hours_left = note_hours_left (note [8]);
		if (hours_left < (casper.config.skip.hours || 120)) { // only new notes 5, 6 and 7 days left
			continue;
		}

		var id_listing = listing_id(note [1]);
		var id_note = parseInt(note[8].replace(/.*href="\D+(\d+)\D+.*/g, '$1'));
		var buy_href = note[8].replace(/.*href="([^"]+)".*/g, '$1');

		if (!id_listing || skip_notes.indexOf(id_note) > -1) {
			continue;
		}

		var borrower = listing_borrower(note [0]);
		if (!borrower || casper.config.skip.borrowers.indexOf(borrower) > -1) {
			continue;
		}


		page_notes.push({
			rating    : rating,
			url       : listing_link(id_listing),
			id_listing : id_listing,
			id        : id_note,
			buy_href  : buy_href,
			borrower  : borrower,
			payments  : payments,
			days      : hours_left / 24,
			invested  : invested,
			remaining : remaining,
			price     : price,
			yield     : yield
		});
	}

	if (casper.config.debug) {
		require('utils').dump(page_notes);
	}

	return page_notes;
}

function sort_notes(notes) {
	return notes.sort(function(a, b){return b.price - a.price});
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

	var info_regex = /cr-label.*\>\s*([\w-]+)\s*\</g;
	var m = info_regex.exec(html);
	if (m && m.length) {
		if (m[1] === '--') {
			m [1] = 'E';
		}
		return m [1];
	}
	return html;
}

function listing_payment_cnt(html) {

	if (html.indexOf('default') > -1) {
		return -1;
	}

	if (html.indexOf('of') == -1) {
		return html;
	}

	var info_regex = /(\d+)/g;
	var m = info_regex.exec(html);
	if (m && m.length) {
		return parseInt(m [1]);
	}
	return 0;
}

function listing_id(html) {
	var info_regex = /\d+/g;
	var m = info_regex.exec(html);
	if (m && m.length) {
		return parseInt(m[0]);
	}
	return -1;
}

function listing_borrower(html) {
	var info_regex = /media-heading.*\>\s*([\w\s]+\w)\s*\</g;
	var m = info_regex.exec(html);
	if (m && m.length) {
		return m[1];
	}
	return -1;
}

function listing_link(id_listing) {
	return 'http://btcjamtop.com/Listings/Inspect/' + id_listing;
}

function is_run_flag(name) {

	var fs = require('fs');

	return fs.isFile(name + '.json');
}

function write_run_flag(name){

	var fs = require('fs');

	fs.write(name + '.json', JSON.stringify({dt: new Date()}), 'w');
}


function ids(records) {

	var ids = []
	for (var i in records) {
		ids.push(records[i].id || records[i].id_listing);
	}
	return ids;
}

function write_json(add_records, name){

	var fs = require('fs');

	var records = load_json(name);

	for (var i in add_records) {
		records.push(add_records[i]);
	}

	fs.write(name + '.json', JSON.stringify(records || []), 'w');
}

function load_json(name){

	var file = name + '.json';

	var fs = require('fs');

	if (!fs.isFile(file)) {
		return [];
	}

	var json = fs.read(file) || [];

	return JSON.parse(json) || [];
}

function init_casper() {

	var fs = require('fs');
	var config_file = fs.read('btcjam.json');
	var config = JSON.parse(config_file) || {};

	var casper = require('casper').create({
		timeout: 240000,
		waitTimeout: 60000,
		verbose: true,
		logLevel: config.debug? 'debug' : 'info',
		pageSettings: {
			userAgent: 'Mozilla/5.0 (Windows NT 6.3; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0',
			sslPprotocol: "tlsv1"
		}
	});

	casper.config = config;
	casper.config.skip.notes = casper.config.skip.notes || [];
	casper.config.skip.borrowers = casper.config.skip.borrowers || [];

	casper.on('remote.message', function(msg) {
		this.log('remote message caught: ' + msg, 'info');
	});

	casper.on("page.error", function(msg, trace) {
		this.captureSelector('error.png', 'html');
		this.log("Page Error: " + msg, "warning");
		for(var i=0; i<trace.length; i++) {
			var step = trace[i];
			this.echo('   ' + step.file + ' (line ' + step.line + ')', 'ERROR');
		}
	});

	casper.on("error", function(msg, trace) {
		this.captureSelector('error.png', 'html');
		this.log(msg, "error");
		// pushbullet ({'body' : '[aws][btcjam] page error'}, this);
	});

	casper.on("wait.timeout", function(msg, trace) {
		this.captureSelector('error.png', 'html');
		this.log(msg, "waitTimeout");
		// pushbullet ({'body' : '[aws][btcjam] page error'}, this);
	});

	casper.on('resource.error',function (request) {
	    this.log(request.url + ' ' + request.errorString, 'warning');
	});

	return casper;
}

function login(casper) {

	casper.start(casper.config.url, function login() {

		casper.waitForSelector('#user_email.email', function fill_login_form() {
			if (this.config.debug) {
				this.captureSelector('before_login.png', 'html');
			}
			this.fill('form#new_user', { 'user[email]': casper.config.user, 'user[password]': casper.config.password }, true);
		});
	}, function error_popup(){
		this.captureSelector('error_login.png', 'html');
	}, 15000)
	.waitForText('Dashboard');

	if (casper.config.debug) {
		casper.then(function after_submit(){
			this.captureSelector('logged_on.png', 'html');
		});
	}
}

function pushbullet(options, casper) {

	var TARGET_EMAIL = casper.config.pushbullet.email;

	if (TARGET_EMAIL) {
		options["email"] = TARGET_EMAIL;
		return 0;
	}

	var API_KEY = casper.config.pushbullet.api_key;

	if (!API_KEY) {
		casper.log("casper.config.pushbullet.api_key missing", "error");
		return 0;
	}

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
		require('utils').dump(this.page.content);
	});

}
