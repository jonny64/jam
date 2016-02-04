var casper = init_casper ();

if (!check_listings ('invest_listings.json')) {
	casper.exit();
}

login (casper);

var all_listings;

casper.then(function(){

	all_listings = load_json('invest_listings.json');

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

	pushbullet({
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

function load_json(filename) {
	var fs = require('fs');


	if (!fs.isFile(filename)) {
		return [];
	}

	var json = fs.read(filename) || [];

	return JSON.parse(json) || [];
}


function buy_listings(listings, casper) {

	var i = 0;

	var processed_listings = [];

	var skip_listings = casper.config.skip.listings.concat(skip_listing_ids('invested_listings'));

	casper.repeat(listings.length, function(){

		var listing = {id: listings [i++]};

		if (!listing.id || skip_listings.indexOf(listing.id) > -1) {
			return;
		}

		listing.url = "https://btcjam.com/listings/" + listing.id;

		var invest_url = listing.url + "/listing_investments";

		casper.thenOpen(listing.url).wait(250).then(function INVEST_LISTING() {

   			var data = {
   				listing_investment: {
   					amount: casper.config.amount || 0.02
   				},
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
					'Content-type': 'application/json;charset=UTF-8',
					'Accept': 'application/json, text/plain, */*',
					'X-Requested-With': 'XMLHttpRequest'
				}
			}).then(function BUY_LISTING(response){
				console.log(response.statusText);
				listing.status = response.statusText;
				listing.bought = response.id && response.created_at;
			});
		});
		processed_listings.push(listing);
	});

	return processed_listings;
}

function mark_buy_listings(listings, filename, casper) {
	write_listings(listings, 'invested_listings');
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

	var file = name + '.json';

	var fs = require('fs');

	if (!fs.isFile(file)) {
		return [];
	}

	var listings_json = fs.read(file) || [];

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
			userAgent: 'Mozilla/5.0 (Windows NT 6.3; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0'
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
	    this.log(request.url + ' ' + request.errorCode + ' ' + request.errorString, 'warning');
	});

	return casper;
}

function login(casper) {

	casper.start(casper.config.url, function login() {

		casper.waitForSelector('#user_email.email', function fill_login_form() {
			if (this.config.debug) {
				this.captureSelector('before_login.png', 'html');
			}
			this.fill('form#new_user', { 'user[email]': casper.config.user_notes, 'user[password]': casper.config.password_notes }, true);
		});
	}, function error_popup(){
		this.captureSelector('error_login.png', 'html');
	}, 15000)
	.waitForText('Dashboard');

	if (casper.config.debug_listings) {
		casper.then(function after_submit(){
			this.captureSelector('logged_on.png', 'html');
		});
	}
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
