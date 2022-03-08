#!/bin/bash

cd $(dirname $0)

./bin/get-oneflow build																\
    --oneflow-build-env   					manylinux                               \
    --oneflow-src   						~/oneflow                               \
    --cmake-init-cache   					~/oneflow/cmake/caches/ci/cpu.cmake     \
    --cuda-version   						none								    \
    --manylinux-cache-dir   				~/manylinux-cache-dirs/unittest-none    \
    --python-versions   					3.7                                     \
    --build-script   						~/oneflow/ci/manylinux/build.sh         \
    --wheelhouse-dir                        '~/manylinux-wheelhouse'                \
    --clear-wheelhouse-dir   				                                        \
    --clean-ccache   					                                            \
    --self-hosted   						                                        
