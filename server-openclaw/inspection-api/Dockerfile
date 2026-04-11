FROM golang:1.23-alpine AS builder

WORKDIR /app

ENV GOPROXY=https://goproxy.cn,direct \
    GOSUMDB=sum.golang.google.cn

COPY go.mod ./
RUN go mod download

COPY . .

RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/inspection-api ./cmd/server

FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /out/inspection-api /app/inspection-api

EXPOSE 8080

CMD ["/app/inspection-api"]
