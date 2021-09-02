ARG from
FROM ${from}
ARG SCCACHE_RELEASE_URL="https://github.com/mozilla/sccache/releases/download/v0.2.15/sccache-v0.2.15-x86_64-unknown-linux-musl.tar.gz"
RUN curl ${SCCACHE_RELEASE_URL} -o sccache.tar.gz && \
    tar zxvf sccache.tar.gz && \
    mv sccache-*/sccache /tmp && \
    chmod +x /tmp/sccache
ARG BAZEL_URL="https://github.com/bazelbuild/bazel/releases/download/3.4.1/bazel-3.4.1-linux-x86_64"
RUN curl -L $BAZEL_URL -o /tmp/bazel \
    && chmod +x /tmp/bazel

ARG from
FROM ${from}
ENV PATH="/usr/local/cuda/bin:/usr/local/llvm/bin:${PATH}"
COPY --from=0 /tmp/sccache /usr/local/bin
COPY --from=0 /tmp/bazel /usr/local/bin

ARG LLVM_SRC_URL="https://github.com/llvm/llvm-project/releases/download/llvmorg-12.0.1/llvm-project-12.0.1.src.tar.xz"
RUN yum install -y nasm rdma-core-devel rsync gdb ninja-build openblas-static autoconf libtool wget ccache
RUN mkdir /llvm-tmp && cd /llvm-tmp && \
    curl ${LLVM_SRC_URL} -o llvm.src.tar.xz && \
    tar xvf llvm.src.tar.xz && \
    cd llvm-project-12.0.1.src && mkdir build && cd build && \
    cmake -G Ninja -DCMAKE_BUILD_TYPE=Release -DLLVM_ENABLE_PROJECTS=lld -DCMAKE_INSTALL_PREFIX=/usr/local ../llvm && ninja install && \
    rm -rf /llvm-tmp
RUN ln -s  $(which ccache) /usr/lib64/ccache/nvcc
