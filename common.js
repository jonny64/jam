var require = patchRequire(require);

function adjust_float(value) {
	return parseFloat(value).toFixed(2);
}

function dt_human(dt_ecma) {
	if (!dt_ecma) {
		return dt_ecma;
	}

	return dt_ecma.replace(/T.*/, '').replace(/(\d+)\D(\d+)\D(\d+)/, '$3.$2.$1');
}

function ids(records) {

	var ids = []
	for (var i in records) {
		ids.push(records[i].id || records[i].id_listing);
	}
	return ids;
}

function write_json(add_records, name, options){

	options = options || {};

	var fs = require('fs');
	var records = options.overwrite? [] : load_json(name);

	var seen = {};
	for (var i in records) {
		if (!records[i].id) {
			continue;
		}
		seen[records[i].id] = 1;
	}

	for (var i in add_records) {
		if (seen[add_records[i].id]) {
			continue;
		}
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

	var data = [];
	try {
		var json = fs.read(file) || [];
		data = JSON.parse(json);
	} catch(e) {
		console.log("load_json failed: " + e.message + "\n\n");
	}

	return data;
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


function init_casper(config_filename) {

	var fs = require('fs');
	var config_file = fs.read(config_filename || 'btcjam.json');
	var config = JSON.parse(config_file) || {};


	config.debug = config.debug || require('system').env.SSH_CLIENT;

	var casper = require('casper').create({
		timeout: 3600 * 1000,
		waitTimeout: 60000,
		verbose: true,
		logLevel: config.debug? 'debug' : 'warning',
		colorizerType: 'Dummy',
		pageSettings: {
			userAgent: 'Mozilla/5.0 (Windows NT 6.3; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0'
		}
	});

	casper.config = config;
	casper.config.skip = casper.config.skip || {};
	casper.config.skip.listings = casper.config.skip.listings || [];
	casper.config.skip.borrowers = casper.config.skip.borrowers || [];

	casper.on('remote.message', function(msg) {
		this.log('remote message caught: ' + msg, 'info');
	});

	casper.on("page.error", function(msg, trace) {
		// this.captureSelector('error.png', 'html');
		this.log("Page Error: " + msg, "warning");
		for(var i=0; i<trace.length; i++) {
			var step = trace[i];
			this.echo('   ' + step.file + ' (line ' + step.line + ')', 'ERROR');
		}
	});

	casper.on("error", function(msg, trace) {
		// this.captureSelector('error.png', 'html');
		this.log(msg, "error");
		// pushbullet ({'body' : '[aws][btcjam] page error'}, this);
	});

	casper.on("wait.timeout", function(msg, trace) {
		// this.captureSelector('error.png', 'html');
		this.log(msg, "waitTimeout");
		// pushbullet ({'body' : '[aws][btcjam] page error'}, this);
	});

	casper.on('resource.error',function (request) {
		var url = request.url.substr(0, 60);
		this.log(url + ' ' + request.errorCode + ' ' + request.errorString, 'warning');
	});

	casper.on('timeout', function on_timeout() {
		this.log('script timeout');
		this.exit();
	});

	(function(log) {
		casper.log = function() {

			if (arguments && arguments[0]) {
				var now = new Date();
				now = '[' + now.toISOString().replace('T', ' ').replace(/\.\d+Z/g, '') + '] ';
				arguments[0] = now + arguments[0];
			}
			return log.apply(this, arguments);
		};
	})(casper.log);

	casper.start(casper.config.url);

	return casper;
}

function login(casper, mail, password) {

	mail = mail || casper.config.user;
	password = password || casper.config.password;

	casper.open(casper.config.url).then(function LOGIN() {

		casper.waitForSelector('#user_email.email', function fill_login_form() {
			if (this.config.debug) {
				// this.captureSelector('before_login.png', 'html');
			}
			this.fill('form#new_user', { 'user[email]': mail, 'user[password]': password }, true);
		});
	}, function error_popup(){
		// this.captureSelector('error_login.png', 'html');
	}, 15000)
	.waitForText('Dashboard')
	.then(function balance(){
		casper.config.balance = parseFloat(this.getHTML('.balance-data').replace(/^\s*\D/, ''));
		casper.config.balance = casper.config.balance || 0.1;
		casper.log('logged on as ' + mail + '; balance is ' + casper.config.balance + "\n\n", "info");
	});

	if (casper.config.debug) {
		casper.then(function after_submit(){
			// this.captureSelector('logged_on.png', 'html');
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
	dt_human: dt_human,
	pushbullet: pushbullet
};