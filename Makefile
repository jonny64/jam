# make build  - build new image from Dockerfile
# make test <example.js>  - run test


NAME=fprieur/docker-casperjs
VERSION=
CASPER=docker run --rm -a stdout -w /mnt/test/ -v `pwd`:/mnt/test $(NAME):$(VERSION) /usr/bin/casperjs \
	/mnt/test/$(filter-out $@,$(MAKECMDGOALS))

CASPER_SSL=docker run --rm -a stdout -w /mnt/test/ -v `pwd`:/mnt/test $(NAME):$(VERSION) /usr/bin/casperjs \
	--ssl-protocol=tlsv1 \
	/mnt/test/$(filter-out $@,$(MAKECMDGOALS))

default:
	@echo Please use \'make build\' or \'make test example.js\'

build:
	docker build -t $(NAME):$(VERSION) .

run:
	$(CASPER)

selftest:
	docker run --rm $(NAME):$(VERSION) /usr/bin/casperjs selftest

btcjam:
	perl -le 'sleep rand 80' && $(CASPER)btcjam.js > ./btcjam.log 2>&1

btcjam_debug:
	$(CASPER)btcjam.js

loanbase:
	perl -le 'sleep rand 180' && $(CASPER_SSL)loanbase.js > ./loanbase.log 2>&1

loanbase_debug:
	$(CASPER_SSL)loanbase.js
tag:
	git tag -d $(VERSION) 2>&1 > /dev/null
	git tag -d latest 2>&1 > /dev/null
	git tag $(VERSION)
	git tag latest

push:
	git push --tags origin master -f
