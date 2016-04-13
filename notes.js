var common = require('./common.js');

var casper = common.init_casper ();

casper.then(function notes_login(){
	common.login (casper, casper.config.user, casper.config.password);
});


var all_notes = [];

var args = casper.cli.args;
var note = args.length == 1? {"id": args[0]} : undefined;
casper.config.no_notify = note || args[0] === "no_notify";

if (note) {
	all_notes = [note];
}

if (note && note.id) {
	casper.then(buy_notes).thenBypass(1);
}

casper.then(function(){
	loop_body.call(this, 0, 50); // 50 round trips
}).run();

function loop_body(cnt, max_cnt){
	if (cnt >= max_cnt) {
		return;
	}

	this.then(function(){
		loop_page.call(this, 1, casper.config.pages || 15);
	});

	this.then(function() {
		this.log("sleeping for 30 secs...", "info");
		this.wait(30000, function(){
			loop_body.call(this, cnt + 1, max_cnt);
		});
	});
}

function loop_page(page, max_page){
	if (page > max_page) {
		return;
	}

	var page_url = jam_datatables_notes_url ((page - 1) * 100, 100);

	this.thenOpen(page_url, jam_datatables_headers ()).wait(500).then(function notes_page_ok(){
		check_notes.call(this);
	});

	this.then(function sort_and_filter_notes(){
		all_notes = sort_notes(all_notes);
		all_notes = filter_notes(all_notes);
		var cnt_notes = all_notes.length;
		if (!this.config.debug_notes && all_notes.length) {
			this.log('PAGE ' + page + " FOUND NOTES!\n\n\n", 'info');
			this.then(buy_notes);
		}

		this.log('PAGE ' + page + ' cnt_notes ' + cnt_notes + "\n\n\n", 'info');
	});

	this.then(function(){
		loop_page.call(this, page + 1, max_page);
	});
}

function check_notes() {

	this.log('check_notes', 'info');

	var data = {};
	try {
		data = JSON.parse(this.getPageContent());
	} catch (e) {
		this.log(e.message, 'error');
		require('utils').dump(this.getPageContent().substr(0, 100));
		return 0;
	}

	if (data.error) {
		this.log(data.error, 'error');
		return 0;
	}

	this.log('data.iTotalRecords: ' + data.iTotalRecords, 'info');

	all_notes = parse_notes(data.aaData, this);

	all_notes = extend_info_notes(all_notes);

	return all_notes.length;
}


function buy_notes() {

	this.then(function logout(){
		common.write_json(all_notes, 'notes');
		common.logout(this);
	});

	this.then(function invest_login(){
		common.login (this, this.config.user_notes, this.config.password_notes);
	});

	this.then(function buy(){
		require('utils').dump(all_notes);
		api_buy_notes(all_notes, this);
	});

	this.then(function post_buy(){

		notify_notes(all_notes, this);
	});

	this.then(function logout(){
		all_notes = [];
		common.logout(this);
	});

	this.then(function login(){
		common.login (this, this.config.user, this.config.password);
	});
};

function api_buy_notes(notes, casper) {

require('utils').dump(notes);

	var i = 0;

	var processed_notes = [];

	casper.repeat(notes.length, function note_loop(){

		var note = notes [i++];

		note.skip = note.skip || note.rating == 'E' && note.listing_amount < 10;

		if (note.skip) {
			note.error = 'note.skip';
			this.log(note.error, 'error');
			return;
		}

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

function extend_info_notes(all_notes){

	casper.then(function(){

		var i = -1;

		casper.repeat(all_notes.length, function(){
			var note = all_notes[++i];

			if (note.rating == 'E') {
				var min_nar = casper.config.skip.yield;
				note.skip = note.yield < (min_nar [note.rating] || min_nar["other"] || 500);
				note.skip = note.skip || note.listing_amount < 10;
				if (note.skip) {
					return;
				}
			}

			casper.thenOpen(jam_listing_url (note.id_listing), jam_datatables_headers (), function listing_ok(response){
				var data;
				try {
					data = JSON.parse(this.getPageContent());
				} catch (e) {
					return;
				}

				if (!data || !data.id) {
					return;
				}
				note.term_days = data.term_days;
				note.created_at = data.created_at;
				note.listing_amount = data.amount_funded;
				note.number_of_payments = data.number_of_payments;
				note.nar = calc_nar(note);

				var min_nar = casper.config.skip.yield;
				note.skip = note.skip || note.nar < (min_nar [note.rating] || min_nar["other"] || 500);
				require('utils').dump(note);
			});
		});
	});

	return all_notes;
}

function calc_nar(note) {

	if (!note.number_of_payments || !note.term_days) {
		return undefined;
	}

	note.rest_payments = note.number_of_payments - note.payments;
	note.rest_period = note.term_days * note.rest_payments / note.number_of_payments;
	var nar = 100 * Math.pow((100 + note.yield) / 100, 365 / note.rest_period) - 100;
	return parseFloat(nar.toFixed(2));
}

function jam_listing_url (id_listing){
	return 'https://btcjam.com/listings/' + id_listing;
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

function notify_notes(page_notes, casper){

	var body = '';
	var subject_postfix = ''
	for (var i in page_notes) {

		var note = page_notes [i];

		var grade = /A|B|C/g.exec(note.rating);

		if (grade && grade.length && !subject_postfix) {
			subject_postfix = grade [0] + ' ' + note.yield;
		}

		body = body + note.rating + ' ' + note.yield + ' % ' + note.borrower
		+ '\nprice\t\t' + note.price
		+ '\nremaining\t' + note.remaining
		+ '\ninvested\t' + note.invested
		+ '\npayments\t' + note.payments + '/' + note.number_of_payments
		+ '\namount\t' + note.listing_amount
		+ '\ncreated\t' + common.dt_human(note.created_at)
		+ '\nterm\t\t' + note.term_days
		+ '\nnar\t\t' + note.nar
		+ '\nid\t\t' + note.id
		+ '\n' + note.url;
		body = body + '\n\n';
	}

	common.pushbullet({
		body  : body,
		title : page_notes.length + ' new notes found ' + subject_postfix
	}, casper);
};

function parse_notes(raw_page_notes, casper) {

	var page_notes = [];

	var skip_notes = casper.config.skip.notes.concat(common.ids(common.load_json('notes')));

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

function filter_notes(notes) {

	var result = [];

	for (var i = notes.length - 1; i >= 0; i--) {
		if (notes[i].skip) {
			continue;
		}
		result.push(notes[i]);
	}

	return result;
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
