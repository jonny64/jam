var common = require('./common.js');

var casper = common.init_casper ();

var all_listings = [];

function check_listings(response){

	if (this.is_found) {
		return;
	}

	var data = [];
	try {
		data = JSON.parse(this.getPageContent());
	} catch (e) {
		this.log(e, 'error');
	}

	if (this.config.debug) {
		this.log('total listings count: ' + data.length);
	}


	all_listings = filter_listings(data);

	if (!all_listings.length) {
		all_listings = [];
		return;
	}

// require('utils').dump(all_listings);

	notify_found_listings(all_listings, this);

	common.write_json(all_listings, 'invest_listings');
};

casper.then(function make_loop() {

	casper.is_found = false;

	var MAX_ATTEMPTS = 60;
	var cnt = 0;

	casper.repeat(MAX_ATTEMPTS, function(){
		if (casper.is_found) {
			return;
		}

		casper.then(function is_found_check(){

				casper.is_found = all_listings.length > 0;

				if (casper.is_found) {
					return;
				}
				if (cnt > 0) {
					casper.wait(60000);
				}
				cnt++;
			})
			.thenOpen(jam_listings_url (), jam_datatables_headers ())
			.then(check_listings)
		;
	});
});

casper.then(function final_check(){

	if (!all_listings.length) {
		casper.exit();
	}
});

casper.then(function invest_login(){
	common.login (casper, casper.config.user_notes, casper.config.password_notes);
});

casper.then(function buy(){
	casper.log('BALANCE ' + casper.config.balance, "warning");
	all_listings = amount_listings(this, all_listings);
	// require('utils').dump(all_listings);
	all_listings = buy_listings(all_listings, this);
});

casper.then(function post_buy(){

	// require('utils').dump(all_listings);

	notify_listings(all_listings, this);

	mark_buy_listings(all_listings, this);
});

casper.run();
casper.viewport(1980, 1080);


function jam_listings_url () {
	return "https://btcjam.com/listings/f/"
		+ "30-60-days,90-120-days/usd-tied,btc-tied,eur-tied/a,b,c/safe/no-hide/ns/no/";
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

function filter_listings (listings) {

	var filtered_listings = [];

	var skip_listings = common.ids(common.load_json('invest_listings'));

	for (var i in listings) {

		var listing = listings [i];
		if (!listing.id || skip_listings.indexOf(listing.id) > -1) {
			continue;
		}

		listing.rating = listing_rating_label(listing.repayment_rate_id);

		listing.apr = common.adjust_float(listing.expected_listing_apr);

		listing.expected_return = common.adjust_float(
			listing.listing_roi * (1 - listing.expected_listing_loss)  - listing.expected_listing_loss
		);

		listing.roi = common.adjust_float(listing.listing_roi);

		filtered_listings.push(listing);
	}

	filtered_listings = sort_listings(filtered_listings);

	return filtered_listings;
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

function sort_listings(listings) {
	return listings.sort(function(a, b){return b.expected_return - a.expected_return});
}

function notify_found_listings(listings, casper){

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
			+ '\nexpected loss\t' + common.adjust_float(100 * listing.expected_listing_loss) + ' % '
			+ '\nalgo score\t' + common.adjust_float(100 * listing.algo_score_listing)
			+ '\ndays\t\t\t' + listing.term_days
			+ '\n' + listing_link(listing.id);
		body = body + '\n\n';

	}

	common.pushbullet({
		body  : body,
		title : listings.length + ' new listings found ' + subject_postfix
	}, casper);
};

function listing_link(id_listing) {
	return 'http://btcjamtop.com/Listings/Inspect/' + id_listing;
}

function notify_listings(page_listings, casper){

	var body = '';
	var cnt_bought = 0;
	for (var i in page_listings) {

		var listing = page_listings [i];

		if (!listing.bought) {
			continue;
		}

		cnt_bought++;

		body = body + listing.id
			+ ' ' + listing.amount
			+ ' (ER ' + listing.expected_return + ')'
			+ '\n';
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

function buy_listings(listings, casper) {

	var i = 0;

	var processed_listings = [];

	casper.repeat(listings.length, function REPEAT_LISTINGS(){

		casper.then(function INVEST_LISTING() {

			var listing = listings [i++];

			if (!listing.amount) {
				return;
			}

			listing.url = "https://btcjam.com/listings/" + listing.id;

			var invest_url = listing.url + "/listing_investments";

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
				if (listing.bought) {
					processed_listings.push(listing);
				}
			});

		}).wait(500);
	});

	return processed_listings;
}

function amount_listings (casper, listings) {

	var skip_listings = casper.config.skip.listings.concat(
		common.ids(common.load_json('invested_listings'))
	);

	var min_balance = casper.config.min_balance || 0.1;
	var balance = (casper.config.balance - min_balance) * 0.5;

	var total_shares = 0.0;
	for (var i in listings) {

		var expected_return = parseFloat(listings [i].expected_return);
		listings[i].shares = expected_return <= 0? 0 : expected_return;
		total_shares = total_shares + listings[i].shares;
	}

	console.log('total_shares = ' + total_shares);

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

function mark_buy_listings(listings, casper) {
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

