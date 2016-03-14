var require = patchRequire(require);

function adjust_float(value) {
	return parseFloat(value).toFixed(2);
}

function ids(records) {

	var ids = []
	for (var i in records) {
		ids.push(records[i].id || records[i].id_listing);
	}
	return ids;
}

function write_json(add_records, name){

	var fs = require('fs');

	var records = load_json(name);

	for (var i in add_records) {
		records.push(add_records[i]);
	}

	fs.write(name + '.json', JSON.stringify(records || []), 'w');
}

function load_json(name){

	var file = name + '.json';

	var fs = require('fs');

	if (!fs.isFile(file)) {
		return [];
	}

	var json = fs.read(file) || [];

	return JSON.parse(json) || [];
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


function init_casper() {

	var fs = require('fs');
	var config_file = fs.read('btcjam.json');
	var config = JSON.parse(config_file) || {};

	var casper = require('casper').create({
		timeout: 3600 * 1000,
		waitTimeout: 60000,
		verbose: true,
		logLevel: config.debug? 'debug' : 'info',
		colorizerType: 'Dummy',
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
		var url = request.url.substr(0, 60);
	    this.log(url + ' ' + request.errorCode + ' ' + request.errorString, 'warning');
	});

	casper.start(casper.config.url);

	return casper;
}

function login(casper, mail, password) {

	mail = mail || casper.config.user;
	password = password || casper.config.password;

	casper.open(casper.config.url).then(function LOGIN() {

		casper.waitForSelector('#user_email.email', function fill_login_form() {
			if (this.config.debug) {
				this.captureSelector('before_login.png', 'html');
			}
			this.fill('form#new_user', { 'user[email]': mail, 'user[password]': password }, true);
		});
	}, function error_popup(){
		this.captureSelector('error_login.png', 'html');
	}, 15000)
	.waitForText('Dashboard')
	.then(function balance(){
		casper.config.balance = parseFloat(this.getHTML('.balance-data').replace(/^\s*\D/, ''));
		casper.config.balance = casper.config.balance || 0.1;
		casper.log('logged on as ' + mail + '; balance is ' + casper.config.balance + "\n\n", "warning");
	});

	if (casper.config.debug_listings) {
		casper.then(function after_submit(){
			this.captureSelector('logged_on.png', 'html');
		});
	}
}

function logout(casper) {

	var data = {
		"_method": "delete"
	};

	casper.thenOpen("https://btcjam.com/").wait(500).then(function eval_csrf(){
			var csrf = this.evaluate(function(){
				return {
					param: $('meta[name=csrf-param]').attr("content"),
					token: $('meta[name=csrf-token]').attr("content")
				};
			});

			data[csrf.param] = csrf.token;
	});



	casper.thenOpen("https://btcjam.com/users/sign_out", {
		method: 'post',
		data: data,
		headers: {
			'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
			'Accept': '*/*',
			'X-Requested-With': 'XMLHttpRequest'
		}
	}).wait(250);
}

module.exports = {
    load_json: load_json,
    write_json: write_json,
    ids: ids,
    init_casper: init_casper,
    login : login,
    logout: logout,
    adjust_float: adjust_float,
    pushbullet: pushbullet
};