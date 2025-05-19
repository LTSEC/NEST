package services

import (
	"fmt"
	"net"
	"os"
	"time"

	"github.com/LTSEC/NEST/enum"
	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
)

// Checks if a router is pingable via ICMP
func ScoreRouterICMP(service enum.Service, address string) (int, bool, error) {
	// Listen for ICMP packets. "ip4:icmp" indicates IPv4 ICMP.
	c, err := icmp.ListenPacket("ip4:icmp", "0.0.0.0")
	if err != nil {
		return 0, false, fmt.Errorf("could not listen for ICMP packets: %w", err)
	}
	defer c.Close()

	// Create an ICMP Echo Request message.
	// The identifier is typically set to a value unique to the process (e.g., the PID).
	message := icmp.Message{
		Type: ipv4.ICMPTypeEcho,
		Code: 0,
		Body: &icmp.Echo{
			ID:   os.Getpid() & 0xffff, // Use lower 16 bits of the PID.
			Seq:  1,
			Data: []byte("PING"),
		},
	}
	messageBytes, err := message.Marshal(nil)
	if err != nil {
		return 0, false, fmt.Errorf("could not marshal ICMP message: %w", err)
	}

	// Resolve the IP address.
	dst, err := net.ResolveIPAddr("ip4", address)
	if err != nil {
		return 0, false, fmt.Errorf("failed to resolve IP address %s: %w", address, err)
	}

	// Send the ICMP Echo Request.
	if _, err := c.WriteTo(messageBytes, dst); err != nil {
		return 0, false, fmt.Errorf("failed to send ICMP request: %w", err)
	}

	// Set a deadline for reading the reply.
	if err := c.SetReadDeadline(time.Now().Add(router_timeout * time.Millisecond)); err != nil {
		return 0, false, fmt.Errorf("failed to set read deadline: %w", err)
	}

	// Buffer to hold the reply.
	reply := make([]byte, 1500)
	n, _, err := c.ReadFrom(reply)
	if err != nil {
		return 0, false, fmt.Errorf("error reading ICMP reply: %w", err)
	}

	// Parse the ICMP message.
	parsedMessage, err := icmp.ParseMessage(1, reply[:n])
	if err != nil {
		return 0, false, fmt.Errorf("failed to parse ICMP message: %w", err)
	}

	// Check if the reply is an Echo Reply.
	switch parsedMessage.Type {
	case ipv4.ICMPTypeEchoReply:
		return service.Award, true, nil
	default:
		return 0, false, fmt.Errorf("unexpected ICMP message type: %v", parsedMessage.Type)
	}
}
