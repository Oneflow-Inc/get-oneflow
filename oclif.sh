#!/bin/bash
./bin/get-oneflow build                                           \
  --oneflow-build-env     manylinux                               \
  --oneflow-src           ~/oneflow                               \
  --cuda-version          none                                    \
  --cmake-init-cache      ~/oneflow/cmake/caches/ci/cpu.cmake     \
  --manylinux-cache-dir   ~/manylinux-cache-dirs/unittest-none    \
  --python-versions       3.7                                     \
  --clear-wheelhouse-dir  true                                    \
  --build-script          ~/oneflow/ci/manylinux/build.sh         \
  --wheelhouse-dir        ~/manylinux-wheelhouse                  \
  --ssh-tank-base-url     none                                    \
  --parallel              none
