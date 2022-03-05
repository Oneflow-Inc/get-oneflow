#!/bin/bash

cd $(dirname $0)

FULL="0"

while getopts 'f' OPT; do
    case $OPT in
        f) FULL="$OPTARG";;
    esac
done


full(){
	./bin/get-oneflow build																\
		--action-type   						undefined								\
		--oneflow-build-env   					manylinux                               \
		--oneflow-src   						~/oneflow                               \
		--oneflow-build-key   					undefined                               \
		--cmake-init-cache   					~/oneflow/cmake/caches/ci/cpu.cmake     \
		--cuda-version   						none								    \
		--compute-platform   					undefined                               \
		--conda-env-file   						undefined                               \
		--conda-env-name   						undefined                               \
		--conda-prefix   						undefined                               \
		--conda-installer-url   				undefined                               \
		--manylinux-cache-dir   				~/manylinux-cache-dirs/unittest-none    \
		--force-rebuild   						undefined                               \
		--dry-run								undefined                               \
		--self-hosted   						true                                    \
		--python-versions   					3.7                                     \
		--wheelhouse-dir   						undefined                               \
		--clear-wheelhouse-dir   				true                                    \
		--wheel-audit   						false                                   \
		--build-script   						~/oneflow/ci/manylinux/build.sh         \
		--retry-failed-build   					false                                   \
		--clean-ccache   						true                                    \
		--docker-run-use-system-http-proxy   	false                                   \
		--docker-run-use-lld   					false                                   \
		--ssh-tank-host   						undefined                               \
		--ssh-tank-path   						undefined                               \
		--ssh-tank-base-url   					undefined                               \
		--parallel								undefined                               \
		--nightly								false
}

default(){
	./bin/get-oneflow build																\
		--oneflow-build-env   					manylinux                               \
		--oneflow-src   						~/oneflow                               \
		--cmake-init-cache   					~/oneflow/cmake/caches/ci/cpu.cmake     \
		--cuda-version   						none								    \
		--manylinux-cache-dir   				~/manylinux-cache-dirs/unittest-none    \
		--self-hosted   						true                                    \
		--python-versions   					3.7                                     \
		--clear-wheelhouse-dir   				true                                    \
		--wheel-audit   						false                                   \
		--build-script   						~/oneflow/ci/manylinux/build.sh         \
		--retry-failed-build   					false                                   \
		--clean-ccache   						true                                    \
		--docker-run-use-system-http-proxy   	false                                   \
		--docker-run-use-lld   					false                                   \
		--ssh-tank-base-url   					undefined                           
}

if [ "$FULL" == "0" ]; then
	default
else
	full
fi
