var common = require('./common.js');

var casper = common.init_casper ();

casper.then(function login(){
	common.login (casper, casper.config.user_notes, casper.config.password_notes);
});

casper.then(navigate_investments_page).then(function(){
	loop_page.call(this, 1, 20);
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

function jam_investments_url (page) {
	page = page || 1;
	return 'https://btcjam.com/listing_investments.json?for_user=true&records=100&page=' + page;
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

	this.thenOpen(jam_investments_url(page), jam_datatables_headers ()).wait(500).then(function(){


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

		var investments = calc_price_investments.call(this, data);

		if (investments.length) {
			this.then(function api_sell_investments() {
				sell_investments.call(this, investments);
			});
		}

		this.log('investments cnt ' + data.length, 'info');
		var page_size = 100;
		if (data.length >= page_size) {
			this.then(function(){
				loop_page.call(this, page + 1, max_page);
			});
		}
	});
}

function calc_price_investments(investments) {
	investments = investments.filter(function(a){return a.payment_state == 'defaulted' && !a.selling});
	investments = investments.sort(function(a, b){return parseFloat(a.amount_left) - parseFloat(b.amount_left)});

	var default_price = 0.125;
	var discount = this.config.discount? this.config.discount.defaulted : default_price;
	discount = discount || default_price;

	for (var i = investments.length - 1; i >= 0; i--) {
		investments[i].sell_price = investments[i].amount_left * discount;
		if (investments[i].sell_price > 0.0001) {
			investments[i].sell_price = parseFloat(investments[i].sell_price.toFixed(4));
		}
	}

	return investments;
}

function sell_investments(investments) {

	var i = 0;

	var processed_investments = [];

	this.then(navigate_investments_page);

	this.repeat(investments.length, function actual_sell_investments(){

		var investment = investments [i++];

		investment.url = "https://btcjam.com/notes?listing_investment_id=" + investment.id;

		if (!investment.sell_price) {
			return;
		}

		var data = {
			listing_investment_id: investment.id,
			"note[ask_price]": investment.sell_price
		};

		var csrf = this.evaluate(function(){
			return {
				param: $('meta[name=csrf-param]').attr("content"),
				token: $('meta[name=csrf-token]').attr("content")
			};
		});

		data[csrf.param] = csrf.token;

		if (this.config.debug) {
			require('utils').dump(data);
		}

		this.open(investment.url, {
			method: 'post',
			data: data,
			headers: {
				'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
				'Accept': '*/*',
				'X-Requested-With': 'XMLHttpRequest'
			}
		}).then(function (response){
			this.log(response.statusText, 'info');
			investment.sell_status = response.statusText;
			if (investment.sell_status == 'OK') {
				processed_investments.push(investment);
			}
			this.exit();
		}).wait(1500).then(navigate_investments_page);

	});

	return processed_investments;
}
