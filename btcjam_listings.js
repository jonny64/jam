var common = require('./common.js');

var casper = common.init_casper ();

if (!check_listings ('invest_listings.json')) {
	casper.exit();
}

common.login (casper);

var all_listings;

casper.then(function(){

	all_listings = common.load_json('invest_listings.json');

	all_listings = buy_listings(all_listings, this);
});

casper.then(function(){

	require('utils').dump(all_listings);

	notify_listings(all_listings, this);

	mark_buy_listings(all_listings, 'invested_listings.json', this)
});

casper.run();
casper.viewport(1980, 1080);

function notify_listings(page_listings, casper){

	var body = '';
	var cnt_bought = 0;
	for (var i in page_listings) {

		var listing = page_listings [i];

		if (!listing.bought) {
			continue;
		}

		cnt_bought++;

		body = body + listing.id + '\n';
	}

	if (cnt_bought == 0) {
		return;
	}

	common.pushbullet({
		body  : body,
		title : 'picked ' + cnt_bought + ' listings'
	}, casper);
};

function sort_listings(listings) {
	return listings.sort(function(a, b){return b.price - a.price});
}

function check_listings(filename) {
	var fs = require('fs');
	return fs.isFile(filename);
}

function buy_listings(listings, casper) {

	var i = 0;

	var processed_listings = [];

	listings = amount_listings(casper, listings);

	casper.repeat(listings.length, function REPEAT_LISTINGS(){

		var listing = listings [i++];

		if (!listing.amount) {
			return;
		}

		listing.url = "https://btcjam.com/listings/" + listing.id;

		var invest_url = listing.url + "/listing_investments";

		casper.then(function INVEST_LISTING() {

			var data = {
				"listing_investment[amount]": listing.amount,
				user_id: casper.config.investor_id || 120812,
				listing_id: listing.id,
				code: null,
			};

			var csrf = casper.evaluate(function(){
				return {
					param: $('meta[name=csrf-param]').attr("content"),
					token: $('meta[name=csrf-token]').attr("content")
				};
			});

			data[csrf.param] = csrf.token;

			casper.open(invest_url, {
				method: 'post',
				data: data,
				headers: {
					'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'Accept': '*/*',
					'X-Requested-With': 'XMLHttpRequest'
				}
			}).then(function BUY_LISTING(response){
				console.log(response.statusText);
				listing.status = response.statusText;
				listing.bought = response.statusText == 'OK';
			});
		});

		if (listing.bought) {
			processed_listings.push(listing);
		}
	});

	return processed_listings;
}

function amount_listings (casper, listings) {

	var skip_listings = casper.config.skip.listings.concat(
		common.ids(common.load_json('invested_listings'))
	);

	var balance = casper.config.balance * 0.5;

	var total_shares = 0;
	for (var i in listings) {
		listing.shares = listings [i].expected_return;
		total_shares = total_shares + listing.shares;
	}

	for (var i in listings) {
		var listing = listings [i];

		if (!listing.id || skip_listings.indexOf(listing.id) > -1) {
			listing.amount = 0;
			continue;
		}

		if (listing.expected_return < 0) {
			listing.amount = 0;
			continue;
		}

		listing.amount = balance * listing.shares / total_shares;
	}

	return listings;
}

function mark_buy_listings(listings, filename, casper) {
	common.write_json(listings, 'invested_listings');
}

function navigate_listings_page(casper) {

	casper.wait(250).thenOpen('https://btcjam.com/listings', function open_listings_page() {
			console.log(this.getTitle() + '\n');
		})
		.waitForResource(/allinvest_listings.json/)
		.wait(500)
	;

	if (casper.config.debug_listings) {
		casper.then(function screen(){
			this.captureSelector('listings.png', 'html');
		});
	}

}

