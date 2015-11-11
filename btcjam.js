var casper = init_casper ();

login (casper);

casper.thenOpen(jam_datatables_notes_url (0, 10), jam_datatables_headers(), function notes_page_ping(response){

	var data = JSON.parse(this.getPageContent());

	var is_empty = !data.iTotalRecords || data.iTotalRecords == 0 || !data.aaData[0] || !data.aaData[0].length;

	if (is_empty && is_send_empty_notify ()) {

		pushbullet({
			body  : 'error',
			title : 'parsing is possibly broken'
		}, casper);

		casper.log('PARSING BROKEN', 'error');

		casper.bypass(2);
	}
});

var all_notes = [];

navigate_notes_api (casper);

casper.then(function(){

	all_notes = extend_info_notes(all_notes);

	all_notes = sort_notes(all_notes);
});

casper.then(function(){

	if (!all_notes.length) {
		casper.log('NO NEW NOTES FOUND! adjust config', 'warning');

		if (!is_send_empty_notify ()) {
			return;
		}
	}

	require('utils').dump(all_notes);

	write_listings(all_notes, 'note_listings');

	notify_notes(all_notes, this);
});

casper.thenOpen(jam_listings_url (), jam_datatables_headers (), function listings_ok(response){

	var data = JSON.parse(this.getPageContent());

	// require('utils').dump(data);

	if (casper.config.debug) {
		casper.log('total listings count: ' + data.length);
	}

	listings = filter_listings(data);

	require('utils').dump(listings);

	notify_listings(listings, this);

	write_listings(listings, 'invest_listings');
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
		+ "&show_current=true&show_late=true&show_default=true&show_credit_score_a=true&show_credit_score_b=true&show_credit_score_c=true&show_credit_score_d=true&show_credit_score_e=true&filter_yield=0&filter_note_price=0&currency_id=all"
		+ "&_=" + Math.random();
}

function jam_listings_url () {
	return "https://btcjam.com/listings/f/"
		+ "30-60-days,90-120-days/usd-tied,btc-tied,eur-tied/a,b,c/safe/no-hide/ns/no/";
}

function add_notes(casper){
	var raw_page_notes = casper.evaluate(function(){
		var notes = $('#allnotes').dataTable();
		return notes.fnGetData();
	});

	var page_notes = parse_notes (raw_page_notes, casper);

	return page_notes;
}

function filter_listings (listings) {

	var filtered_listings = [];

	var skip_listings = skip_listing_ids('invest_listings');

	for (var i in listings) {

		var listing = listings [i];
		if (!listing.id || skip_listings.indexOf(listing.id) > -1) {
			continue;
		}

		listing.rating = listing_rating_label(listing.repayment_rate_id);

		listing.apr = adjust_float(listing.expected_listing_apr);

		listing.expected_return = adjust_float(
			listing.listing_roi * (1 - listing.expected_listing_loss)  - listing.expected_listing_loss
		);

		listing.roi = adjust_float(listing.listing_roi);

		filtered_listings.push(listing);
	}

	filtered_listings = sort_listings(filtered_listings);

	return filtered_listings;
}

function is_send_empty_notify() {
	var now = new Date();
	return now.getHours() === 5 && now.getMinutes() <= 10;
}

function notify_listings(listings, casper){

	if (!listings.length) {
		casper.log('NO NEW LISTINGS FOUND!', 'warning');

		if (!is_send_empty_notify ()) {
			return;
		}
	}

	var body = '';
	var subject_postfix = '';
	for (var i in listings) {

		var listing = listings [i];

		var grade = /A|B|C/g.exec(listing.rating);

		if (grade && grade.length && !subject_postfix) {
			subject_postfix = grade [0];
		}

		body = body + 100 * listing.expected_return + ' % ' + listing.rating
			+ ' ' + listing.title
			+ '\napr\t' + 100 * listing.apr + ' % '
			+ '\nyield\t' + 100 * listing.roi + ' % '
			+ '\nexpected loss\t' + adjust_float(100 * listing.expected_listing_loss) + ' % '
			+ '\nalgo score\t' + adjust_float(100 * listing.algo_score_listing)
			+ '\ndays\t\t\t' + listing.term_days
			+ '\nis risky\t\t' + listing.is_risky
			+ '\n' + listing_link(listing.id);
		body = body + '\n\n';

	}

	pushbullet({
		body  : body,
		title : listings.length + ' new listings found ' + subject_postfix
	}, casper);
};

function adjust_float(value) {
	return parseFloat(value).toFixed(2);
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
		+ '\ndays\t\t' + note.days
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

	var skip_listings = casper.config.skip.listings.concat(skip_listing_ids('note_listings'));

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

		if (price >= invested || price >= remaining || remaining < 0.01) {
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
		if (!id_listing || skip_listings.indexOf(id_listing) > -1) {
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

function extend_info_notes(notes) {
	return notes;
}

function sort_notes(notes) {
	return notes.sort(function(a, b){return b.price - a.price});
}

function sort_listings(listings) {
	return listings.sort(function(a, b){return b.expected_return - a.expected_return});
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

function listing_rating_label(id_rating) {

	var voc_ratings = {
		77  : "A-",
		80  : "B-",
		83  : "C-",
		109 : "C+"
	};

	return voc_ratings [id_rating] || id_rating;
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

function write_listings(listings, name){
	var fs = require('fs');

	var ids = skip_listing_ids(name);

	for (var i in listings) {
		ids.push(listings[i].id || listings[i].id_listing);
	}

	fs.write(name + '.json', JSON.stringify(ids || []), 'w');
}

function skip_listing_ids(name){
	var fs = require('fs');
	var listings_json = fs.read(name + '.json');
	return JSON.parse(listings_json) || [];
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
	casper.config.skip.listings = casper.config.skip.listings || [];
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
	}, 15000);

	if (casper.config.debug) {
		casper.then(function after_submit(){
			this.captureSelector('logged_on.png', 'html');
		});
	}
}

function navigate_notes_page(casper) {

	casper.wait(250).thenOpen('https://btcjam.com/notes', function open_notes_page() {
		console.log(this.getTitle() + '\n');
	});

	casper.waitForText('Note Marketplace')
		.then(function change_note_length_100(){
			this.evaluate(function(){
				$('select[name=allnotes_length]').val(100);
				return $('select[name=allnotes_length]').trigger('change');
			});
	});

	var invested_sort = 'th[aria-label*=Invested]';
	casper.waitForSelector(invested_sort)
		.thenClick(invested_sort)
		.wait(250)
		.waitForResource(/allnotes.json.*iSortCol_0=2&sSortDir_0=asc/)
		.wait(250)
		.thenClick(invested_sort)
		.wait(250)
		.waitForResource(/allnotes.json.*iSortCol_0=2&sSortDir_0=desc/)
		.wait(500);

	if (casper.config.debug) {
		casper.then(function screen(){
			this.captureSelector('notes.png', 'html');
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
