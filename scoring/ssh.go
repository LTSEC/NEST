package scoring

import (
	"fmt"
	"strconv"
	"time"

	"golang.org/x/crypto/ssh"
)

// Attempts a connection via ssh and returns a boolean value representing success
func SSHConnect(hostname string, port string, username string, password string) (bool, error) {

	// take add host and port together for use in config
	host := hostname + ":" + port

	//var key ssh.Signer
	var err error

	// client config, ignore hostkey because we don't plan on having the IP change
	// reenable hostkey callback if we need to worry about dynamic ips in the future
	// todo: add optional public key
	conf := &ssh.ClientConfig{
		User:            username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Auth: []ssh.AuthMethod{
			//ssh.PublicKeys(key),
			ssh.Password(password),
		},
		Timeout: 250 * time.Millisecond,
	}

	var conn *ssh.Client

	conn, err = ssh.Dial("tcp", host, conf)
	if err != nil {
		return false, err
	}
	defer conn.Close()

	var session *ssh.Session
	session, err = conn.NewSession()
	if err != nil {
		return false, err
	}
	defer session.Close()

	return true, nil
}

func ScoreSSH(address string, portNum int, username string, password string) (int, bool, error) {
	_, err := SSHConnect(address, strconv.Itoa(portNum), username, password)
	if err != nil {
		return 0, false, fmt.Errorf("SSH scoring failed: %v", err)
	}

	return successPoints, true, nil
}
