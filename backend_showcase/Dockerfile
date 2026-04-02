# build the application first
FROM golang:1.23 AS builder
WORKDIR /src
COPY ./backend_showcase .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o backend main.go

# run it on alpine
FROM alpine
WORKDIR /exec

# copy relevant files
COPY --from=builder /src/backend ./backend
COPY /backend_showcase/files ./files
COPY /backend_showcase/scripts ./scripts
COPY /terraform_showcase /terraform_showcase
COPY /ansible_showcase /ansible_showcase

# have to add the opentofu package
RUN echo '@community https://dl-cdn.alpinelinux.org/alpine/edge/community' >> /etc/apk/repositories

# install python, opentofu, ansible, and SSH tooling
RUN apk add --no-cache \
    python3 py3-pip \
    openssh-client sshpass \
    opentofu@community && \
    pip3 install --break-system-packages ansible && \
    ansible-galaxy collection install vyos.vyos community.routeros

# run
EXPOSE ${BACKEND_PORT}
CMD ["./backend"]