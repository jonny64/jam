var common = require('./common.js');

var casper = common.init_casper ();

casper.then(function login(){
	common.login (casper, casper.config.user_notes, casper.config.password_notes);
});

var all_investments = [];

casper.then(navigate_investments_page).then(function(){
	loop_page.call(this, 1, 50);
});

casper.then(function(){
	write_stats.call(this, all_investments);
});

casper.run();
casper.viewport(1980, 1080);

function navigate_investments_page() {

	this.wait(250).thenOpen('https://btcjam.com/listing_investments', function open_listings_page() {
			this.log(this.getTitle(), 'info');
		})
		.wait(500)
	;
}

function jam_investments_url (page, page_size) {
	page = page || 1;
	return 'https://btcjam.com/listing_investments.json?dir=asc&for_user=true&sorting=created_at'
		+ '&records=' + page_size + '&page=' + page;
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

function loop_page(page, max_page){
	if (page > max_page) {
		return;
	}

	var page_size = 100;

	this.thenOpen(jam_investments_url(page, page_size), jam_datatables_headers ()).wait(500).then(function(){


		var data = [];
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

		if (page == 1 && !data.length) {
			this.log('investments.length: ' + data.length, 'error');
		}

		this.log('investments cnt ' + data.length, 'info');

		all_investments = all_investments.concat(data);


		if (data.length >= page_size) {
			this.then(function(){
				loop_page.call(this, page + 1, max_page);
			});
		}
	});
}

function write_stats(investments){

	var totals = {};

	var now = new Date();
	var dt_start = new Date();
	var dt_end = new Date();
	dt_start.setMonth(now.getMonth() - 2);
	dt_end.setMonth(now.getMonth() - 1);

	for (var i = investments.length - 1; i >= 0; i--) {

		var state = investments[i].payment_state;

		if (investments[i].user) {
			totals.btc_to_usd_rate = totals.btc_to_usd_rate || investments[i].user.btc_to_usd_rate;
		}

		if(state == 'Repaid') {
			continue;
		}

		var total = totals[state] || 0;
		var amount = parseFloat(investments[i].amount);
		var amount_left = parseFloat(investments[i].amount_left);
		var amount_received = parseFloat(investments[i].amount_received);
		totals[state] = total + amount_left;

		totals.term_days = totals.term_days || {};
		totals.term_days[state] = totals.term_days[state] || {};
		totals.term_days[state][investments[i].listing.term_days] = totals.term_days[state][investments[i].listing.term_days] || 0;
		totals.term_days[state][investments[i].listing.term_days] = totals.term_days[state][investments[i].listing.term_days]
			+ amount_left;

		var created_at = new Date(investments[i].created_at);

		if (dt_start <= created_at && created_at <= dt_end){
			totals.last_month = totals.last_month || {amount: 0, late: {cnt: 0, amount: 0}, current: {cnt: 0, amount: 0}};
			var amount_total = amount_left + amount_received;
			if (state.indexOf('late') >= 0) {
				totals.last_month.late.cnt++;
				totals.last_month.late.amount = totals.last_month.late.amount + amount_total;
			} else {
				totals.last_month.current.cnt++;
				totals.last_month.current.amount = totals.last_month.current.amount + amount_total;
			}
			totals.last_month.amount = totals.last_month.amount + amount;
// require('utils').dump(investments[i]);
		}
	}


	var now = new Date();
	totals.dt = now.toISOString();
	totals.free = this.config.balance;
	totals.funding = totals ["Funding in progress"];
	delete totals ["Funding in progress"];

	common.write_json (investments, 'investments', {overwrite: true});
	common.write_json ([totals], 'totals', {overwrite: true});

	append_csv('stat.csv', totals);
}

function append_csv(filename, totals) {
		
	var headers = ["free", "funding", "current", "late 1-30 days", "late 31-120 days", "defaulted"];

	var csv = [];
	var grand_total = 0;
	for (var i = 0; i < headers.length; i++) {
		var total = totals[headers[i]];
		if(headers[i] == "free" || headers[i] == "current" || headers[i] == "funding") {
			grand_total = grand_total + total;
		}
		csv.push(total);
	}

	csv.unshift(totals["dt"], totals["btc_to_usd_rate"], grand_total);
	csv = csv.join(',');
	var fs = require('fs');

	if (!fs.isFile(filename)) {
		headers.unshift("dt", "btc_to_usd_rate", "total");
		fs.write(filename, headers.join(',') + "\n", 'w');
	}

	totals.total = grand_total;
	require('utils').dump(totals);


	if (require('system').env.SSH_CLIENT) {
		return;
	}

	fs.write(filename, csv + "\n", 'a');
}
