var common = require('./common.js');

var casper = common.init_casper ('loanbase.json');

var api_url = "https://api.loanbase.com/api/";

var loans_url = api_url + "loans?status=funding&reputationFrom=1&denomination=btc,usd&term=1,7,14,30,60,90,120&salary=4,5,6,7";

var loans = [];

casper.thenOpen(loans_url, {
	method: "get",
	headers: {
		"Host": "api.loanbase.com",
		"Accept": "application/vnd.blc.v1+json",
		"Cache-Control": "no-cache"
	}
}, function(response){

	var data = {};
	try {
		data = JSON.parse(this.getPageContent());
	} catch (e) {
		this.log(e.message, 'error');
		require('utils').dump(this.getPageContent().substr(0, 100));
		return 0;
	}

	if (response.status !== 200 || data.errors) {
		this.log(require('utils').dump(data), "error");
		return;
	}

	loans = loans.concat(data.loans);
}).waitForText("loans");

casper.then(function filter_loans(){

	var sorted_loans = [];

	for (var i = 0; i < loans.length; i++) {
		var loan = loans [i];

		if (!loan_score_ok(casper, loan)){
			continue;
		}
		sorted_loans.push(loan);
	}

	loans = sorted_loans;
})

casper.then(function invest_loans(){

	this.log(require('utils').dump(loans), 'info');
});

casper.then(function invest() {

	var i = 0;

	casper.repeat(loans.length, function invest() {

		var loan = loans [i];

		casper.thenOpen(api_url + "investment", {
			method: "post",
			data: {
				loan_id: loan.id,
				amount: casper.config.amount || 0.0042,
			},
			headers: {
				"Authorization": "Bearer " + casper.config.token,
				"Content-Type": "application/x-www-form-urlencoded",
				"Host": "api.loanbase.com",
				"Accept": "application/vnd.blc.v1+json",
				"Cache-Control": "no-cache"
			}
		}, function investment(response){

			this.log(response.statusText, 'info');

			var data = {};
			try {
				data = JSON.parse(this.getPageContent());
			} catch (e) {
				this.log(e.message, 'error');
				require('utils').dump(this.getPageContent());
				return 0;
			}

			if (response.status !== 200 || data.errors) {
				this.log(this.getPageContent(), "error");
				return;
			}
		}).wait(250);

		i++;
	});
});


casper.run();

function loan_score_ok (casper, loan){

	if (!loan) {
		return 0;
	}
	var score = loan.creditScore;

	if (!score) {
		return 0;
	}

	return score.indexOf("A") === 0
		|| score.indexOf("B") === 0
		|| score.indexOf("C") === 0
	;
}
