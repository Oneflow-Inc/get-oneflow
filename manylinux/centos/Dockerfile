ARG from
FROM ${from}
ARG LLVM_SRC_URL="https://github.com/llvm/llvm-project/releases/download/llvmorg-12.0.1/llvm-project-12.0.1.src.tar.xz"
RUN mkdir /llvm-tmp && cd /llvm-tmp \
    && curl -L ${LLVM_SRC_URL} -o llvm.src.tar.xz \
    && tar xf llvm.src.tar.xz \
    && cd llvm-project-12.0.1.src && mkdir build && cd build \
    && cmake -DCMAKE_BUILD_TYPE=Release -DLLVM_ENABLE_PROJECTS=lld -DCMAKE_INSTALL_PREFIX=/usr/local ../llvm && make install -j$(nproc) \
    && rm -rf /llvm-tmp
ARG SCCACHE_RELEASE_URL="https://github.com/mozilla/sccache/releases/download/v0.2.15/sccache-v0.2.15-x86_64-unknown-linux-musl.tar.gz"
RUN mkdir /sccache-tmp && cd /sccache-tmp && curl -L ${SCCACHE_RELEASE_URL} -o sccache.tar.gz \
    && tar zxf sccache.tar.gz \
    && mv sccache-*/sccache /usr/local/bin \
    && chmod +x /usr/local/bin/sccache \
    && rm -rf /sccache-tmp
ARG BAZEL_URL="https://github.com/bazelbuild/bazel/releases/download/3.4.1/bazel-3.4.1-linux-x86_64"
RUN curl -L $BAZEL_URL -o /usr/local/bin/bazel \
    && chmod +x /usr/local/bin/bazel
RUN yum install -y wget nasm rdma-core-devel rsync gdb ninja-build openblas-static autoconf libtool wget ccache devtoolset-7-gcc* vim
ENV PATH="/usr/local/cuda/bin:/usr/local/llvm/bin:${PATH}"
ENV PATH=/usr/lib64/ccache:$PATH
RUN ln -s  $(which ccache) /usr/lib64/ccache/g++
RUN ln -s  $(which ccache) /usr/lib64/ccache/nvcc
