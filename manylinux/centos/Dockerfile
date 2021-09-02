ARG from
FROM ${from}
ARG SCCACHE_RELEASE_URL="https://github.com/mozilla/sccache/releases/download/v0.2.15/sccache-v0.2.15-x86_64-unknown-linux-musl.tar.gz"
RUN curl ${SCCACHE_RELEASE_URL} -o sccache.tar.gz && \
    tar zxvf sccache.tar.gz && \
    mv sccache-*/sccache /tmp && \
    chmod +x /tmp/sccache
ARG bazel_url="https://github.com/bazelbuild/bazel/releases/download/3.4.1/bazel-3.4.1-linux-x86_64"
RUN curl -L $bazel_url -o /tmp/bazel \
    && chmod +x /tmp/bazel

ARG from
FROM ${from}
ENV PATH="/usr/local/cuda/bin:/usr/local/llvm/bin:${PATH}"
COPY --from=0 /tmp/sccache /usr/local/bin
COPY --from=0 /tmp/bazel /usr/local/bin
RUN yum install -y nasm rdma-core-devel rsync gdb ninja-build openblas-static autoconf libtool wget ccache
