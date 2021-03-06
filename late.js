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
	return 'https://btcjam.com/listing_investments.json?dir=asc&for_user=true&sorting=created_at&records=100&page=' + page;
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
	var yld = 100 * (1 / discount - 1);

	for (var i = investments.length - 1; i >= 0; i--) {
		investments[i].sell_price = investments[i].amount_left * discount;
		if (investments[i].sell_price > 0.0001) {
			investments[i].sell_price = parseFloat(investments[i].sell_price.toFixed(4));
		}

		if (investments[i].sell_price < 0.000001) {
			investments[i].sell_price = 0.000001;
		}

		investments[i].yld = yld;
	}

	return investments;
}

function comment_investments(investment) {

	if (!investment.listing) {
		return {};
	}

	investment.id_listing = investment.listing.id;

	if (!investment.id_listing) {
		return {};
	}

	var yld = investment.yld;

	if (yld <= 100) {
		return {};
	}

	yld = yld > 5000? 5000
		: yld > 3000? 3000
		: yld > 2000? 2000
		: yld > 1000? 1000
		: yld > 800? 800
		: yld > 500? 500
		: yld > 300? 300
		: yld > 200? 200
		: yld > 100? 100
		: ''
	;

	var tails = [
		''
		, 'Visit Notes Marketplace.'
		, 'See Notes Marketplace.'
		, 'Pick up at Notes Marketplace.'
	];

	
	var tail = tails[random_integer(0, tails.length)];
	var yield_label = "Notes available for this loan. Over " + yld + '% yield. ';

	if (random_integer(0, 1) > 0 && tail) {
		tail = tail + ' Thank you.';
	}

	var comment = yield_label + (tail? tail : '');
	this.log(comment, 'info');

	var listing_url = "https://btcjam.com/listings/" + investment.id_listing;

	return {
		listing_url: listing_url,
		url: listing_url + "/comments",
		label: yield_label,
		data: {
			"utf8": "%E2%9C%93",
			"comment[comment]": comment,
			"commit": "Create Comment"
		}
	};
}

function already_exists_comments(comments, label) {
	for (var i = comments.length - 1; i >= 0; i--) {
		if (comments[i].indexOf(label) > 0) {
			return true;
		}
	}
	return false;
}

function random_integer(min, max) {
	var rand = min - 0.5 + Math.random() * (max - min + 1)
	rand = Math.round(rand);
	return rand;
}

function search_comments() {
	return this.evaluate(function search_comments_dom() {
		return [].map.call(__utils__.findAll('#listing_comments-table td .expandable'), function(node) {
			return node.textContent;
		});
	})
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

		var comment = comment_investments.call(this, investment);

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
		if (comment && comment.url && comment.data) {
			comment.data[csrf.param]= csrf.token;
		}

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
		});

		if (comment.listing_url) {
			this.wait(11500)
			.thenOpen(comment.listing_url, function search_comments_step() {
				var comments = search_comments.call(this);
				if (this.config.debug) {
					require('utils').dump(comments);
				}
				if (already_exists_comments (comments, comment.label)) {
					this.log('comment for listing ' + comment.listing_url + ' already exists, skipping...', 'warning')
					if (!require('system').env.SSH_CLIENT) {
						this.exit();
					}
					this.thenBypass(2);
				}
			})
			.thenOpen(comment.url, {
				method: 'post',
				data: comment.data,
				headers: {
					'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'Accept': '*/*',
					'X-Requested-With': 'XMLHttpRequest'
				}
			}).then(function comment_response_step(response){
				this.log(response.statusText, 'info');
				if (!require('system').env.SSH_CLIENT) {
					this.exit();
				}
			})
			.wait(1500)
		}

		this.then(navigate_investments_page);

	});

	return processed_investments;
}
