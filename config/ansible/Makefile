
DOCKER_SERVICE:= docker.service

IMAGE_NAME:= ansible_strashbot_test
CONTAINER_NAME:= strashbot_test

ANSIBLE_INVENTORY?=./inventory.yaml
ANSIBLE_DOCKER_TEST_INVENTORY:= ./docker_test/inventory.yaml
ANSIBLE_SSH_TEST_HOSTNAME?= ssh_test
ANSIBLE_PLAYBOOK?= ./playbook.yaml
ANSIBLE_VARIABLES?= ./variables.yaml
ANSIBLE_DOCKER_TEST_VARIABLES:= ./docker_test/variables.yaml

ANSIBLE_DOCKER_TEST_FLAG?= false

SSH_ARG_PORT:= $(shell yq '.my_hosts.hosts.ssh_test.ansible_port' $(ANSIBLE_DOCKER_TEST_INVENTORY) | tr -d '"')
SSH_ARG_ANSIBLE_USER:= $(shell yq '.my_hosts.hosts.ssh_test.ansible_user' $(ANSIBLE_DOCKER_TEST_INVENTORY) | tr -d '"')
SSH_ARG_ANSIBLE_PASSWORD:= $(shell yq '.my_hosts.hosts.ssh_test.ansible_ssh_pass' $(ANSIBLE_DOCKER_TEST_INVENTORY) | tr -d '"')

SOURCE_GIT_BRANCH?= $(shell git rev-parse --abbrev-ref HEAD || echo "dev-unknown")
LOCAL_SOURCE_DIR:=

README_FILE=../../README.md

about:
	# Check the `README.md` file at the root of this project 
	#
	sed -n $(shell grep -n "^### remote install" "${README_FILE}"  | cut -d: -f1),$(shell expr $(shell grep -n "^## Tests" "${README_FILE}"  | cut -d: -f1) - 1)p "${README_FILE}"		

install:
	echo "Use \`make remote_install\` or \`local_install\` => check 'README.md'"

remote_install:
	ansible-playbook -i "$(ANSIBLE_INVENTORY)" "$(ANSIBLE_PLAYBOOK)" \
				-e "variables_file_var=$(ANSIBLE_VARIABLES)" \
				-e "git_branch_var=$(SOURCE_GIT_BRANCH)" \
				-e "docker_test_flag=$(ANSIBLE_DOCKER_TEST_FLAG)"

ansible_test: run_docker
	sleep 3
	ansible-playbook -vvv -i "$(ANSIBLE_DOCKER_TEST_INVENTORY)" "$(ANSIBLE_PLAYBOOK)" \
				-e "variables_file_var=$(ANSIBLE_DOCKER_TEST_VARIABLES)" \
				-e "host_var=$(ANSIBLE_SSH_TEST_HOSTNAME)" \
				-e "git_branch_var=$(SOURCE_GIT_BRANCH)" \
				-e "docker_test_flag=true"

local_install:
	ansible-playbook "$(ANSIBLE_PLAYBOOK)" \
				-e "variables_file_var=$(ANSIBLE_VARIABLES)" \
				-e "host_var=127.0.0.1" -e "git_branch_var=$(SOURCE_GIT_BRANCH)" \
				-e "source_fetch=${LOCAL_SOURCE_DIR}" \
				-e "docker_test_flag=$(ANSIBLE_DOCKER_TEST_FLAG)" \
				--connection=local

start_docker_service:
	systemctl is-active $(DOCKER_SERVICE) || systemctl start $(DOCKER_SERVICE)

build_docker: start_docker_service
	docker build -t $(IMAGE_NAME) \
			--build-arg "SSH_USER=$(SSH_ARG_ANSIBLE_USER)" \
			--build-arg "SSH_PASSWORD=$(SSH_ARG_ANSIBLE_PASSWORD)" \
			-f docker_test/Dockerfile \
			.

run_docker: start_docker_service
	docker run -d --name $(CONTAINER_NAME) \
			-p $(SSH_ARG_PORT):22 \
			$(IMAGE_NAME)
exec_bash_container:
	if [ -n "$(shell docker ps -f "name=$(CONTAINER_NAME)" -f "status=running" -q )" ]; then \
		docker exec -it "$(CONTAINER_NAME)" bash; \
	fi

stop_container:
	if [ -n "$(shell docker ps -f "name=$(CONTAINER_NAME)" -f "status=running" -q )" ]; then \
		docker stop $(CONTAINER_NAME); \
		docker rm $(CONTAINER_NAME); \
	fi

update_docker_base: start_docker_service
	docker pull archlinux:latest