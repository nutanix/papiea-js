default: build_all
.PHONY: default

papiea-packages = core client backend-utils engine sdk/typescript


run-tests: run-papiea
	cd ./papiea-engine; \
	docker-compose exec papiea-engine yarn run test; \
	docker-compose exec papiea-engine bash -c 'cd /code/papiea-sdk/typescript && npm test'
.PHONY: run-tests

run-python-e2e-tests: run-papiea
	cd ./papiea-engine; \
	docker-compose exec papiea-engine yarn run test; \
	docker-compose exec papiea-engine bash -c 'cd /code/papiea-sdk/python/e2e_tests && \
	python3.8 -m pip install -r requirements.txt && \
	python3.8 -m pytest -s --disable-pytest-warnings'
.PHONY: run-python-tests

run-benchmark: build_main
	cd ./papiea-engine/__benchmarks__; \
	yarn run bench -- $(ARGS)
.PHONY: run-benchmark

run-benchmark-local: papiea-engine/__benchmarks__/build run-papiea
	cd ./papiea-engine; \
	docker-compose exec papiea-engine bash -c 'cd __benchmarks__ && npm run bench-local'
.PHONY: run-benchmark-local

run-papiea: build_main
	cd ./papiea-engine; \
	if [ -z `docker-compose ps -q papiea-engine` ] || [ -z `docker ps -q --no-trunc | grep $$(docker-compose ps -q papiea-engine)` ]; then \
	docker-compose up -d; \
	  for i in `seq 1 10`; \
	  do \
		docker-compose logs --tail=5 papiea-engine | grep 'app listening on port' && echo Success && exit 0; \
		sleep 2; \
		docker-compose logs --tail=5; \
	  done \
	fi
.PHONY: run-papiea

run-papiea-debug: build_main
	cd ./papiea-engine; \
	if [ -z `docker-compose ps -q papiea-engine` ] || [ -z `docker ps -q --no-trunc | grep $$(docker-compose ps -q papiea-engine)` ]; then \
	docker-compose -f docker-compose-debug.yml up -d; \
	  for i in `seq 1 10`; \
	  do \
		docker-compose logs --tail=5 papiea-engine | grep 'app listening on port' && echo Success && exit 0; \
		sleep 2; \
		docker-compose logs --tail=5; \
	  done \
	fi
.PHONY: run-papiea-debug

stop-papiea:
	cd ./papiea-engine; \
		if [ -z `docker-compose ps -q papiea-engine` ] || [ -z `docker ps -q --no-trunc | grep $$(docker-compose ps -q papiea-engine)` ]; then \
		echo 'Papiea not running'; \
	else \
	  docker-compose kill; \
	fi
.PHONY: stop-papiea

build_all: build_main papiea-engine/__benchmarks__/build
.PHONY: build_all

papiea-engine/__benchmarks__/build: papiea-engine/__benchmarks__/node_modules
	yarn --cwd papiea-engine/__benchmarks__ run build
.PHONY: papiea-engine/__benchmarks__/build

papiea-engine/__benchmarks__/node_modules: build_main
	yarn --cwd papiea-engine/__benchmarks__
.PHONY: papiea-engine/__benchmarks__/node_modules

build_main: node_modules_main papiea-engine/build papiea-sdk/typescript/build
.PHONY: build_main

papiea-sdk/typescript/build:
	yarn --cwd papiea-sdk/typescript run build
.PHONY: papiea-sdk/typescript/build

papiea-engine/build:
	yarn --cwd papiea-engine run build
.PHONY: papiea-engine/build

node_modules_main: build_deps papiea-engine/node_modules papiea-sdk/typescript/node_modules
.PHONY: node_modules_main

papiea-sdk/typescript/node_modules:
	yarn --cwd papiea-sdk/typescript
.PHONY: papiea-sdk/typescript/node_modules # TODO fix dependencies

papiea-engine/node_modules:
	yarn --cwd papiea-engine
.PHONY: papiea-engine/node_modules

build_deps: papiea-client/build
.PHONY: build_deps

papiea-client/build: papiea-client/node_modules
	yarn --cwd papiea-client run build
.PHONY: papiea-client/build

papiea-client/node_modules: papiea-backend-utils/build
	yarn --cwd papiea-client
.PHONY: papiea-client/node_modules

papiea-backend-utils/build: papiea-backend-utils/node_modules
	yarn --cwd papiea-backend-utils run build
.PHONY: papiea-backend-utils/build

papiea-backend-utils/node_modules: papiea-core/build
	yarn --cwd papiea-backend-utils
.PHONY: papiea-backend-utils/node_modules

papiea-core/build: papiea-core/node_modules
	yarn --cwd papiea-core run build
.PHONY: papiea-core/build

papiea-core/node_modules:
	yarn --cwd papiea-core
.PHONY: papiea-core/node_modules

clean-all: clean-node-modules clean
.PHONY: clean-all

clean-node-modules:
	for p in $(papiea-packages) ; do rm -rf papiea-$$p/node_modules; done; \
	cd ./papiea-engine/__benchmarks__; \
	rm -rf node_modules
.PHONY: clean-node-modules

clean:
	yarn run clean-all; \
	cd ./papiea-engine/__benchmarks__; \
	rm -rf build
.PHONY: clean

remove_dev_deps:
	for p in $(papiea-packages) ; do node ./remove_dev_deps papiea-$$p; done;
.PHONY: remove_dev_deps

update_typescript_versions:
	for p in $(papiea-packages) ; do node ./update_version papiea-$$p $(UPD_TYPE) $(BUILD_NUM) $(VERSION); done;
.PHONY: update_typescript_versions
