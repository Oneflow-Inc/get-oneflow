ARG from
FROM ${from}
ARG SCCACHE_RELEASE_URL="https://github.com/mozilla/sccache/releases/download/v0.2.15/sccache-v0.2.15-x86_64-unknown-linux-musl.tar.gz"
RUN curl ${SCCACHE_RELEASE_URL} -o sccache.tar.gz && \
    tar zxvf sccache.tar.gz && \
    mv sccache-*/sccache /tmp && \
    chmod +x /tmp/sccache
ARG from
FROM ${from}
COPY --from=0 /tmp/sccache /usr/local/bin
RUN yum install -y nasm rdma-core-devel rsync gdb ninja-build openblas-static autoconf libtool wget ccache
