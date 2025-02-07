package services

import (
	"fmt"
	"strconv"
	"time"

	"github.com/LTSEC/NEST/enum"
	"golang.org/x/crypto/ssh"
)

// Establishes an SSH connection based on the given hostname, port, and user/password combo
// For now, does not work with ssh keys
func establishSSHConnection(hostname string, port string, username string, password string) (bool, error) {
	conf := &ssh.ClientConfig{
		User:            username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // ignoring host keys for now
		Auth: []ssh.AuthMethod{
			ssh.Password(password),
		},
		Timeout: ssh_timeout * time.Millisecond,
	}

	hostAddr := hostname + ":" + port
	conn, err := ssh.Dial("tcp", hostAddr, conf)
	if err != nil {
		return false, fmt.Errorf("failed SSH dial: %v", err)
	}
	defer conn.Close()

	session, err := conn.NewSession()
	if err != nil {
		return false, fmt.Errorf("failed to start SSH session: %v", err)
	}
	defer session.Close()

	return true, nil
}

func ScoreSSHLogin(service enum.Service, address string) (int, bool, error) {
	// Check for single user
	var servUp bool
	if service.User != "" {
		var err error // i hate this part of go why not just work
		servUp, err = establishSSHConnection(address, strconv.Itoa(service.Port), service.User, service.Password)
		if err != nil {
			return 0, false, err
		}
	} else {
		username, password, err := ChooseRandomUser(service.QFile)
		servUp, err = establishSSHConnection(address, strconv.Itoa(service.Port), username, password)
		if err != nil {
			return 0, false, err
		}
	}
	if servUp {
		return service.Award, true, nil
	} else {
		return 0, false, nil
	}

}
