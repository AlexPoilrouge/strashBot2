
slash_registration = 

.docker_start:
	systemctl is-active docker.service || systemctl start docker.service

test_build: .docker_start
	docker build --rm --build-arg Register_Slash="$(slash_registration)" -f Dockerfile -t strashbot_test:0.0.0 .

test_run: test_build
	docker run --rm --name strashbot_tester -it strashbot_test:0.0.0

test_init: test_run

test_exec_bash:
	docker exec -it strashbot_tester bash
