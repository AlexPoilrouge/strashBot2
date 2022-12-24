
.docker_start:
	systemctl is-active docker.service || systemctl start docker.service

test_build: .docker_start
	docker build --rm -f Dockerfile -t strashbot_test:0.0.0 .

test_run: test_build
	docker run --rm -it strashbot_test:0.0.0

test_init: test_run
