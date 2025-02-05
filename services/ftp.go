package services

import (
	"fmt"
	"time"

	"github.com/LTSEC/NEST/enum"
	"github.com/jlaffaye/ftp"
)

// establishFTPConnection is a utility function that attempts to connect to the designated ip
// address at the designated port with the FTP protocol, and returns the connection or an error.
func establishFTPConnection(ip string, port int) (ftp.ServerConn, error) {
	connection, err := ftp.Dial(
		fmt.Sprintf("%s:%d", ip, port),
		ftp.DialWithTimeout(ftp_timeout*time.Millisecond),
	)

	return *connection, err
}

// ScoreFTP is a general scorer for FTP that checks for a valid FTP connection and then returns
func ScoreFTP(service enum.Service, address string) (int, bool, error) {
	return 0, false, nil
}

// ScoreFTPLogin is a scorer for FTP that checks for if the user can log in
func ScoreFTPLogin(service enum.Service, address string) (int, bool, error) {
	return 0, false, nil
}

// ScoreFTPWrite is a scorer for FTP that checks for if the user can write to a/many file(s)
func ScoreFTPWrite(service enum.Service, address string) (int, bool, error) {
	return 0, false, nil
}

// ScoreFTPRead is a scorer for FTP that checks if the user can read from a/many file(s)
func ScoreFTPRead(service enum.Service, address string) (int, bool, error) {
	return 0, false, nil
}
