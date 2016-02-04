var casper = init_casper ();

if (!check_notes ('notes.json')) {
	casper.exit();
}

login (casper);

navigate_notes_page (casper);

var all_notes;

casper.then(function(){

	all_notes = load_json('notes.json');

	all_notes = buy_notes(all_notes, this);
});

casper.then(function(){

	require('utils').dump(all_notes);

	notify_notes(all_notes, this);

	mark_buy_notes(all_notes, 'notes.json', this)
});

casper.run();
casper.viewport(1980, 1080);

function notify_notes(page_notes, casper){

	var body = '';
	var cnt_bought = 0;
	for (var i in page_notes) {

		var note = page_notes [i];

		if (!note.bought) {
			continue;
		}

		cnt_bought++;

		body = body + note.id + '\n';
	}

	pushbullet({
		body  : body,
		title : 'picked ' + cnt_bought + ' notes'
	}, casper);
};

function sort_notes(notes) {
	return notes.sort(function(a, b){return b.price - a.price});
}

function check_notes(filename) {
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


function buy_notes(notes, casper) {

	var i = 0;

	var processed_notes = [];

	casper.repeat(notes.length, function(){

		var note = {id: notes [i++]};

		var buy_url = "https://btcjam.com/notes/" + note.id + "/buy";

		casper.then(function BUY_NOTE() {

   			var data = { _method: 'buy' };
   			var csrf = casper.evaluate(function(){
   				return {
   					param: $('meta[name=csrf-param]').attr("content"),
   					token: $('meta[name=csrf-token]').attr("content")
   				};
   			});
			data[csrf.param] = csrf.token;

			casper.open(buy_url, {
				method: 'post',
				data: data,
				headers: {
					'Content-type': 'application/x-www-form-urlencoded',
					'Accept': 'text/html,application/xhtml+xml,application/xml',
					'X-Requested-With': 'XMLHttpRequest'
				}
			}).then(function BUY_NOTE(response){
				console.log(response.statusText);
				note.status = response.statusText;
				note.bought = response.status == "200";
					// && this.page.content.indexOf('insufficent') == -1
			});
		});
		processed_notes.push(note);
	});

	return processed_notes;
}

function mark_buy_notes(notes, filename, casper) {
	var fs = require('fs');
	fs.remove(filename);
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

	if (casper.config.debug_notes) {
		casper.then(function after_submit(){
			this.captureSelector('logged_on.png', 'html');
		});
	}
}

function navigate_notes_page(casper) {

	casper.wait(250).thenOpen('https://btcjam.com/notes', function open_notes_page() {
			console.log(this.getTitle() + '\n');
		})
		.waitForResource(/allnotes.json/)
		.wait(500)
	;

	if (casper.config.debug_notes) {
		casper.then(function screen(){
			this.captureSelector('notes.png', 'html');
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
