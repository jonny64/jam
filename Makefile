# Author: Radim Daniel Pánek <rdpanek@gmail.com>
#
# make build  - build new image from Dockerfile
# make test <example.js>  - run test


NAME=fprieur/docker-casperjs
VERSION=


default:
	@echo Please use \'make build\' or \'make test example.js\'

build:
	docker build -t $(NAME):$(VERSION) .

run:
	docker run --rm -w /mnt/test/ -v `pwd`:/mnt/test $(NAME):$(VERSION) /usr/bin/casperjs \
		/mnt/test/$(filter-out $@,$(MAKECMDGOALS))

selftest:
	docker run --rm $(NAME):$(VERSION) /usr/bin/casperjs selftest

tag:
	git tag -d $(VERSION) 2>&1 > /dev/null
	git tag -d latest 2>&1 > /dev/null
	git tag $(VERSION)
	git tag latest

push:
	git push --tags origin master -f
