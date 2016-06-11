var common = require('./common.js');

var casper = common.init_casper ();

casper.then(function login(){
	common.login (casper, casper.config.user_notes, casper.config.password_notes);
});

var all_transactions = [];

casper.then(navigate_transactions_page).then(function(){
	loop_page.call(this, 1, 50, 'Withdraw');
}).then(function(){
	loop_page.call(this, 1, 50, 'Deposit');
}).then(function(){
//	loop_page.call(this, 1, 5, 'Payment Received');
});


casper.then(function(){
	write_stats.call(this, all_transactions);
});

casper.run();
casper.viewport(1980, 1080);

function navigate_transactions_page() {

	this.wait(250).thenOpen('https://btcjam.com/transactions', function open_listings_page() {
			this.log(this.getTitle(), 'info');
		})
		.wait(500)
	;
}

function jam_transactions_url (page, page_size, type) {
	page = page || 1;
	return 'https://btcjam.com/transactions.json?'
		+ 'userid=' + casper.config.investor_id
		+ '&sEcho=5&iColumns=3&sColumns=%2C%2C'
		+ '&iDisplayStart=' + (page - 1) * page_size
		+ '&iDisplayLength=' + page_size
		+ '&mDataProp_0=0&mDataProp_1=1&mDataProp_2=2'
		+ '&type=' + type
	;
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

function loop_page(page, max_page, type){
	if (page > max_page) {
		return;
	}

	var page_size = 100;

	this.thenOpen(jam_transactions_url(page, page_size, type), jam_datatables_headers ()).wait(500).then(function(){


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

		if (page == 1 && (!data.iTotalRecords || !data.aaData || !data.aaData.length)) {
			this.log('transactions.length: ' + data.iTotalRecords, 'error');
		}

		data = data.aaData;

		this.log('transactions cnt ' + data.length, 'info');

		all_transactions = all_transactions.concat(adjust_transactions(data, type));


		if (data.length >= page_size) {
			this.then(function(){
				loop_page.call(this, page + 1, max_page, type);
			});
		}
	});
}

function write_stats(transactions){
	require('utils').dump(transactions);
	common.write_json (transactions, 'transactions', {overwrite: true});
}

function adjust_transactions(transactions, type) {
	var result = [];
	for (var i = transactions.length - 1; i >= 0; i--) {
		var t = transactions[i];
		var dt = t[0].replace(/.*\>(\w+ \d+, \d{4} \d{2}:\d{2}:\d{2}).*/, '$1 GMT+0300');
		dt = (new Date(dt)).toISOString();
		result.push({
			raw_detail: t[0],
			dt   : dt,
			id   : t[1].replace(/\w+\:\s*(\w+)\n/, '$1'),
			"type" : type,
			total: parseFloat(t[2].replace(/^(-?)\D*/, '$1'))
		});
	}

	return result;
}