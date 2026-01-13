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
# have to add the opentofu package
RUN echo '@community https://dl-cdn.alpinelinux.org/alpine/edge/community' >> /etc/apk/repositories
# install used stuff
RUN apk add python3 opentofu@community
# run
EXPOSE ${BACKEND_PORT}
CMD ["./backend"]