# make build  - build new image from Dockerfile
# make test <example.js>  - run test


NAME=fprieur/docker-casperjs
VERSION=
CASPER=docker run --rm -a stdout -w /mnt/test/ -v `pwd`:/mnt/test $(NAME):$(VERSION) /usr/bin/casperjs \
	/mnt/test/$(filter-out $@,$(MAKECMDGOALS))

default:
	@echo Please use \'make build\' or \'make test example.js\'

build:
	docker build -t $(NAME):$(VERSION) .

run:
	$(CASPER)

selftest:
	docker run --rm $(NAME):$(VERSION) /usr/bin/casperjs selftest

cron:
	perl -le 'sleep rand 180' && $(CASPER) &> ./btcjam.log

cron_debug:
	$(CASPER) &> ./btcjam.log

tag:
	git tag -d $(VERSION) 2>&1 > /dev/null
	git tag -d latest 2>&1 > /dev/null
	git tag $(VERSION)
	git tag latest

push:
	git push --tags origin master -f
