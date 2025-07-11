

IMAGE_NAME:= strashbot_test:0.0.0
CONTAINER_NAME:= strashbot_tester

.docker_start:
	systemctl is-active docker.service || systemctl start docker.service

test_build: .docker_start
	docker build -f Dockerfile -t $(IMAGE_NAME) .

test_run: 
	docker run --rm --name ${CONTAINER_NAME} -it $(IMAGE_NAME)

test_run_bash:
	docker run --rm --name ${CONTAINER_NAME} -it $(IMAGE_NAME) bash

test_init: test_build test_run

test_exec_bash:
	docker exec -it ${CONTAINER_NAME} bash
