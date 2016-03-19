# make build  - build new image from Dockerfile
# make test <example.js>  - run test


NAME=fprieur/docker-casperjs
VERSION=
CASPER=docker run --rm -a stdout -w /mnt/test/ -v `pwd`:/mnt/test $(NAME):$(VERSION) /usr/bin/casperjs \
	/mnt/test/$(filter-out $@,$(MAKECMDGOALS))

CASPER_LB=docker run --rm -a stdout -w /mnt/test/ -v `pwd`:/mnt/test $(NAME):$(VERSION) /usr/bin/casperjs \
	--ssl-protocol=any \
        /mnt/test/$(filter-out $@,$(MAKECMDGOALS))

CASPER_SSL=/usr/local/bin/casperjs --ssl-protocol=any

version:
	$(CASPER) --version

selftest:
	docker run --rm $(NAME):$(VERSION) /usr/bin/casperjs selftest

notes:
	$(CASPER_SSL) notes.js > ./notes.log 2>&1

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

loanbase:
	perl -le 'sleep rand 180' && $(CASPER_LB)loanbase.js > ./loanbase.log 2>&1

loanbase_debug:
	$(CASPER_LB)loanbase.js
