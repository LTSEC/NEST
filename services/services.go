package services

import "github.com/LTSEC/NEST/enum"

const (
	// Timeouts, miliseconds
	router_timeout = 250
	ftp_timeout    = 250
	ssh_timeout    = 250
	sql_timeout    = 250
	dns_timeout    = 500
	web_timeout    = 15000
)

var ScoringDispatch = map[string]func(service enum.Service, address string) (int, bool, error){
	//"ftp": ScoreFTP,.
	// add more as needed
	"ftp": ScoreFTP,
}
