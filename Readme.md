# CSEC Club Scoring Engine

## Purpose
The purpose of this scoring engine is to emulate a competition's scoring system

## Tools
### Go
- [websocket](https://pkg.go.dev/github.com/gorilla/websocket)
- [PostgreSQL](https://pkg.go.dev/github.com/lib/pq)
- [Templ](https://pkg.go.dev/github.com/a-h/templ)
### Python
- flask, flask-login
- psycopg2

## Startup
For now, you'll have to run
- docker compose up
- webserver.py
And finally the scoring engine .exe (or go run main.go)
Once you've run the scoring engine, you can run defaultconfig or insert your own config
After inserting a config, run startup and everything should work.