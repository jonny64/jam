# make build  - build new image from Dockerfile
# make test <example.js>  - run test


NAME=fprieur/docker-casperjs
VERSION=latest
CASPER=docker run --rm --attach stdout --workdir /mnt/test/ --volume `pwd`:/mnt/test $(NAME):$(VERSION) /usr/bin/casperjs \
	/mnt/test/$(filter-out $@,$(MAKECMDGOALS))

CASPER_LB=docker run --rm -a stdout -w /mnt/test/ -v `pwd`:/mnt/test $(NAME):$(VERSION) /usr/bin/casperjs \
	--ssl-protocol=any \
        /mnt/test/$(filter-out $@,$(MAKECMDGOALS))

CASPER_SSL=/usr/bin/casperjs --ssl-protocol=any

version:
	$(CASPER) --version

selftest:
	$(CASPER_SSL) selftest

notes:
	$(CASPER_SSL) notes.js >> ./notes.log 2>&1

notes_debug:
	$(CASPER_SSL) notes.js $(filter-out $@,$(MAKECMDGOALS))

btcjam_reset:
	-rm btcjam_run.json
	-rm notes.json

btcjam_listings:
	$(CASPER_SSL) btcjam_listings.js >> ./listings.log 2>&1

btcjam_listings_debug:
	-rm invest_listings.json
	$(CASPER_SSL) btcjam_listings.js $(filter-out $@,$(MAKECMDGOALS))

late:
	perl -le 'sleep rand 900' && $(CASPER_SSL) late.js >> ./late.log 2>&1

late_debug:
	$(CASPER_SSL) late.js

loanbase:
	perl -le 'sleep rand 180' && $(CASPER_LB)loanbase.js > ./loanbase.log 2>&1

loanbase_debug:
	$(CASPER_LB)loanbase.js

stat_cron:
	$(CASPER_SSL) stat.js >> ./stat.log 2>&1

stat:
	$(CASPER_SSL) stat.js

stat_import: stat
	mongoimport --db btcjam --collection ins  --jsonArray --upsertFields id --file investments.json
	mongoimport --db btcjam --collection totals --jsonArray --file totals.json

stat_import_cron: stat_cron
	mongoimport --db btcjam --collection ins  --jsonArray --upsertFields id --file investments.json >> ./stat.log 2>&1
	mongoimport --db btcjam --collection totals --jsonArray --file totals.json >> ./stat.log 2>&1
	mongo btcjam stat.adjust_floats.js >> ./stat.log 2>&1

adjust_floats:
	mongo btcjam stat.adjust_floats.js

total:
	mongo btcjam stat.total.js

total3:
	mongo btcjam stat.total3.js

slate:
	mongo btcjam stat.late.js

scur:
	mongo btcjam stat.cur.js

csv:
	mongoexport --db btcjam --collection ins --type=csv \
	--fields created_at,payment_state,amount,amount_received,amount_left,\
	listing.amount,listing.currency_id,listing.credit_score_group.name,listing.term_days \
	--out ./investments.csv


flow:
	$(CASPER_SSL) flow.js

flow_import: flow
	mongoimport --db btcjam --collection trs  --jsonArray --upsertFields id --file transactions.json
flow.total:
	mongo btcjam flow.total.js
flow.avg:
	mongo btcjam flow.avg.js
