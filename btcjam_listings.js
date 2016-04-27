var common = require('./common.js');

var casper = common.init_casper ();

casper.then(function login(){
	common.login (casper, casper.config.user, casper.config.password);
});

var all_listings = [];

function check_listings(){

	this.log('check_listings', 'info');

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

	this.log('total listings count: ' + data.length, 'info');

	all_listings = filter_listings(data);

	if (!all_listings.length) {
		all_listings = [];
		return data.length;
	}

// require('utils').dump(all_listings);

	return data.length;
};

var args = casper.cli.args;
var listing = args.length == 2? {"id": args[0], "amount_invest": args[1]} : undefined;
casper.config.no_notify = listing || args[0] === "no_notify";

if (listing) {
	all_listings = [listing];
}

if (listing && listing.id) {
	casper.then(buy_listings).thenBypass(1);
}

casper.then(function(){
	loop_body.call(this, 0, 60); // 1 hr
}).run();


function loop_page(page, max_page){
	if (page > max_page) {
		return;
	}

	var page_url = page > 1? ('?page=' + page) : '';

	this.thenOpen(jam_listings_url () + page_url, jam_datatables_headers ()).wait(500).then(function(){
		var cnt_listings = check_listings.call(this);

		if (all_listings.length) {
			this.then(buy_listings);
		}

		this.log('cnt_listings ' + cnt_listings, 'info');
		var page_size = 10;
		if (cnt_listings >= page_size) {
			this.then(function(){
				loop_page.call(this, page + 1, max_page);
			});
		}
	});
}

function loop_body(cnt, max_cnt){
	if (cnt >= max_cnt) {
		return;
	}

	this.then(function(){
		loop_page.call(this, 1, 10);
	});

	this.then(function() {
		this.log("sleeping for 1 minute...", "info");
		this.wait(60000, function(){
			loop_body.call(this, cnt + 1, max_cnt);
		});
	});
}

function buy_listings() {

	this.then(function logout(){
		common.logout(this);
	});

	this.then(function invest_login(){
		common.login (this, this.config.user_notes, this.config.password_notes);
	});

	this.then(function buy(){

		all_listings = amount_listings(this, all_listings);
		// require('utils').dump(all_listings);
		all_listings = api_buy_listings(all_listings, this);
	});

	this.then(function post_buy(){

		var invested_listings = [];
		for (var i in all_listings) {
			var listing = all_listings [i];
			if (listing.amount_invest <= 0) {
				continue;
			}
			invested_listings.push(listing);
		}
		all_listings = invested_listings;
		// require('utils').dump(all_listings);

		notify_listings(all_listings, this);
	});

	this.then(function logout(){
		all_listings = [];
		common.logout(this);
	});

	this.then(function login(){
		common.login (this, this.config.user, this.config.password);
	});
};

casper.run();
casper.viewport(1980, 1080);


function jam_listings_url () {
	return "https://btcjam.com/listings/f/"
		+ "30-60-days,90-120-days,180-365-days/usd-tied,btc-tied,eur-tied/a,b,c/safe/no-hide/ns/no";
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

	var skip_listings = casper.config.skip.listings.concat(
		common.ids(common.load_json('invested_listings'))
	);

	for (var i in listings) {

		var listing = listings [i];

		var max_term = casper.config.max_term || 180;
		if (listing.term_days > max_term) {
			console.log("skipping listing " + listing.id + " since term " + listing.term_days + " > max_term " + max_term);
			continue;
		}

		if (!listing.id || skip_listings.indexOf(listing.id) > -1) {
			continue;
		}

		listing.rating = listing_rating_label(listing.repayment_rate_id);

		listing.apr = common.adjust_float(listing.expected_listing_apr);

		listing.expected_return = common.adjust_float(
			listing.listing_roi * (1 - listing.expected_listing_loss)  - listing.expected_listing_loss
		);

		if (listing.expected_return <= 0) {
			console.log("skipping listing " + listing.id + " since ER " + listing.expected_return + " is negative");
			continue;
		}

		listing.roi = common.adjust_float(listing.listing_roi);

		filtered_listings.push(listing);
	}

	common.write_json(listings, 'invested_listings');

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

function found_listings(listings, casper){

	if (casper.config.no_notify) {
		return '';
	}

	var body = '';
	var subject_postfix = '';
	for (var i in listings) {

		var listing = listings [i];

		var grade = /A|B|C/g.exec(listing.rating);

		if (grade && grade.length && !subject_postfix) {
			subject_postfix = grade [0];
		}

		var er = 100 * (listing.expected_return || 0);

		body = body + er.toFixed(2) + ' % ' + listing.rating
			+ ' ' + listing.title
			+ '\napr\t' + 100 * listing.apr + ' % '
			+ '\nyield\t' + 100 * listing.roi + ' % '
			+ '\nexpected loss\t' + common.adjust_float(100 * listing.expected_listing_loss) + ' % '
			+ '\nalgo score\t' + common.adjust_float(100 * listing.algo_score_listing)
			+ '\ndays\t\t\t' + listing.term_days
			+ '\n' + listing_link(listing.id);
		body = body + '\n\n';

	}

	return body;
};

function listing_link(id_listing) {
	return 'http://btcjamtop.com/Listings/Inspect/' + id_listing;
}

function notify_listings(page_listings, casper){

	if (casper.config.no_notify) {
		return;
	}

	var body = found_listings (page_listings, casper);
	var cnt_bought = 0;
	for (var i in page_listings) {

		var listing = page_listings [i];

		if (!listing.bought) {
			continue;
		}

		cnt_bought++;

		body = body + '\n' + listing.id
			+ ' ' + common.adjust_float(listing.amount_invest)
			+ ' (ER ' + listing.expected_return * 100 + ' %)'
		;
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

function api_buy_listings(listings, casper) {

	var i = 0;

	var processed_listings = [];

	casper.repeat(listings.length, function REPEAT_LISTINGS(){

		var listing = listings [i++];

		listing.url = "https://btcjam.com/listings/" + listing.id;

		if (!listing.amount_invest) {
			return;
		}

		casper.thenOpen(listing.url, jam_datatables_headers (), function AMOUNT_LISTING(response){
			var data;
			try {
				data = JSON.parse(this.getPageContent());
			} catch (e) {
				this.log(e.message, 'error');
				return;
			}

			if (!data || !data.id) {
				return;
			}

			listing.amount_funded = data.amount_funded;
			listing.amount = data.amount;
			listing.amount_rest = listing.amount - listing.amount_funded;

			if (listing.amount_invest >= listing.amount_rest * 0.5) {
				listing.amount_invest = listing.amount_rest * 0.5;
				this.log('listing ' + listing.id + ' corrected amount ' + listing.amount_invest, 'error');
			}
		});

		casper.thenOpen(listing.url).wait(500).then(function INVEST_LISTING() {

			if (!listing.amount_invest) {
				return;
			}

			listing.amount_invest = parseFloat(listing.amount_invest.toFixed(3));

			if (listing.amount_invest <= 0) {
				return;
			}

			require('utils').dump(listing);

			var invest_url = listing.url + "/listing_investments";

			var data = {
				"listing_investment[amount]": listing.amount_invest,
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

	var min_balance = casper.config.min_balance || 0.1;
	var balance = (casper.config.balance - min_balance) * 0.5;

	var total_shares = 0.0;
	for (var i in listings) {

		var expected_return = parseFloat(listings [i].expected_return);
		listings[i].shares = expected_return <= 0? 0 : expected_return;
		total_shares = total_shares + listings[i].shares;
	}

	console.log('total_shares = ' + total_shares);

	var invest_listings = [];

	for (var i in listings) {
		var listing = listings [i];

		if (listing.amount_invest >= 0) {
			console.log('listing ' + listing.id + ' amount ' + listing.amount_invest);
			invest_listings.push(listing);
			continue;
		}

		listing.amount_invest = balance * listing.shares / total_shares;

		if (listing.amount_invest <= 0) {
			listing.amount_invest = 0;
			console.log('listing ' + listing.id + ' amount ' + listing.amount_invest);
			continue;
		}

		console.log('listing ' + listing.id + ' amount ' + listing.amount_invest);

		invest_listings.push(listing);
	}

	return invest_listings;
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

