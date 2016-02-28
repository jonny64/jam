var casper = init_casper ();
casper.start("http://loanbase.com");
casper.log("init done", "info");

var api_url = "https://api.loanbase.com/api/";

var loans_url = api_url + "loans?status=funding&reputationFrom=1&denomination=btc,usd&term=1,7,14,30,60,90,120&salary=5,6,7";

var loans = [];

casper.thenOpen(loans_url, {
	method: "get",
	headers: {
		"Host": "api.loanbase.com",
		"Accept": "application/vnd.blc.v1+json",
		"Cache-Control": "no-cache"
	}
}, function(response){

	if (response.status !== 200) {
		this.log(require('utils').dump(response), "error");
		return;
	}

	var data = JSON.parse(this.getPageContent());
	loans = loans.concat(data.loans);
	// this.log(require('utils').dump(loans), "info");
}).waitForText("loans");

casper.then(function filter_loans(){

	// casper.log(require('utils').dump(loans), 'info');

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

	casper.log(require('utils').dump(loans), 'info');
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

			if (response.status !== 200) {
				this.log(require('utils').dump(response), "error");
				return;
			}

			this.log(require('utils').dump(this.getPageContent()), "info");
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

function init_casper() {

	var fs = require('fs');
	var config_file = fs.read('loanbase.json');
	var config = JSON.parse(config_file) || {};

	config.url = config.url || "https://api.loanbase.com/api/loans?status=funding";
	config.debug = true;

	var casper = require('casper').create({
		timeout: 600000,
		waitTimeout: 600000,
		verbose: true,
		// logLevel: config.debug? 'debug' : 'info',
		logLevel: 'info'
	});

	casper.config = config;

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
	    this.log(request.url + ' ' + request.errorString, 'warning');
	});

	return casper;
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
