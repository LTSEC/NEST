# CSEC Club Scoring Engine

## Purpose
The purpose of this scoring engine is to emulate a competition's scoring system

## Tools
### Go
- [websocket](https://pkg.go.dev/github.com/gorilla/websocket)
- [PostgreSQL](https://pkg.go.dev/github.com/lib/pq)
- [smetrics](https://github.com/xrash/smetrics)
- [chromedp](https://github.com/chromedp/chromedp)
- [pq](https://pkg.go.dev/github.com/lib/pq)

### Python
- flask, flask-login
- psycopg2

### General
- Docker

## Startup
- Run docker compose up --build
- docker ps
- docker attach [scoring-engine container id]
From there, you're free to interact with the CLI, use "help" if you don't know the commands