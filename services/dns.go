package services

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"strings"
	"time"

	"github.com/LTSEC/NEST/enum"
	"github.com/miekg/dns"
)

// getTeamNumberFromAddress extracts the team number from the given resolver IP address.
// For external scoring (mode == "external"), it returns the last octet.
// For internal scoring (mode == "internal"), it returns the third octet.
func getTeamNumberFromAddress(address, mode string) (string, error) {
	// In case the address includes a port (e.g. "10.20.1.1:53"), extract the host.
	host := address
	if strings.Contains(address, ":") {
		var err error
		host, _, err = net.SplitHostPort(address)
		if err != nil {
			// If splitting fails, fall back to the full address.
			host = address
		}
	}
	parts := strings.Split(host, ".")
	if len(parts) != 4 {
		return "", fmt.Errorf("invalid IPv4 address: %s", host)
	}

	switch mode {
	case "external":
		// Last octet
		return parts[3], nil
	case "internal":
		// Third octet (0-indexed)
		return parts[2], nil
	default:
		return "", fmt.Errorf("unknown mode: %s", mode)
	}
}

// replaceTeamToken replaces all occurrences of "<t>" in the given string with team.
func replaceTeamToken(s, team string) string {
	return strings.ReplaceAll(s, "<t>", team)
}

// reverseIP returns the reverse lookup domain for an IPv4 address.
// For example, "10.20.1.1" becomes "1.1.20.10.in-addr.arpa."
func reverseIP(ip string) (string, error) {
	parts := strings.Split(ip, ".")
	if len(parts) != 4 {
		return "", fmt.Errorf("invalid IPv4 address: %s", ip)
	}
	// Reverse the octets.
	return fmt.Sprintf("%s.%s.%s.%s.in-addr.arpa.", parts[3], parts[2], parts[1], parts[0]), nil
}

// queryDNS sends a DNS query (of type qtype) for the given domain to the resolver.
func queryDNS(resolver, domain string, qtype uint16) ([]string, error) {
	client := dns.Client{
		Timeout: dns_timeout * time.Second,
	}
	msg := dns.Msg{}
	// Ensure the domain is fully qualified.
	msg.SetQuestion(dns.Fqdn(domain), qtype)

	response, _, err := client.Exchange(&msg, resolver)
	if err != nil {
		return nil, fmt.Errorf("DNS query error: %v", err)
	}
	if response.Rcode != dns.RcodeSuccess {
		return nil, fmt.Errorf("DNS query failed (rcode %s)", dns.RcodeToString[response.Rcode])
	}

	var results []string
	for _, answer := range response.Answer {
		switch record := answer.(type) {
		case *dns.A:
			results = append(results, record.A.String())
		case *dns.PTR:
			results = append(results, record.Ptr)
		}
	}
	return results, nil
}

// ScoreDNSExternalFwd checks that for each line in the query file,
// a forward DNS query (A record) for the external domain returns the expected external IP.
// The team number is derived from the resolver’s last octet.
func ScoreDNSExternalFwd(service enum.Service, address string) (int, bool, error) {
	team, err := getTeamNumberFromAddress(address, "external")
	if err != nil {
		return 0, false, err
	}

	f, err := os.Open(service.QFile)
	if err != nil {
		return 0, false, fmt.Errorf("failed to open query file: %v", err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		// Skip empty lines.
		if strings.TrimSpace(line) == "" {
			continue
		}
		// Expecting 4 fields: externalIP externalDomain internalIP internalDomain
		fields := strings.Fields(line)
		if len(fields) < 4 {
			return 0, false, fmt.Errorf("invalid query file format: %s", line)
		}

		// Replace "<t>" with team number.
		expectedIP := replaceTeamToken(fields[0], team)
		domain := replaceTeamToken(fields[1], team)

		// Query for an A record.
		results, err := queryDNS(address, domain, dns.TypeA)
		if err != nil {
			return 0, false, fmt.Errorf("DNS A query for %s failed: %v", domain, err)
		}

		// Check that the expected IP is present.
		found := false
		for _, ip := range results {
			if ip == expectedIP {
				found = true
				break
			}
		}
		if !found {
			return 0, false, fmt.Errorf("external forward lookup mismatch for %s: got %v, expected %s", domain, results, expectedIP)
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, false, fmt.Errorf("error reading query file: %v", err)
	}

	return service.Award, true, nil
}

// ScoreDNSExternalRev checks that for each line in the query file,
// a reverse DNS (PTR) query for the external IP returns the expected external domain.
// The team number is derived from the resolver’s last octet.
func ScoreDNSExternalRev(service enum.Service, address string) (int, bool, error) {
	team, err := getTeamNumberFromAddress(address, "external")
	if err != nil {
		return 0, false, err
	}

	f, err := os.Open(service.QFile)
	if err != nil {
		return 0, false, fmt.Errorf("failed to open query file: %v", err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			return 0, false, fmt.Errorf("invalid query file format: %s", line)
		}

		// For external reverse lookup, use the external IP and domain.
		expectedIP := replaceTeamToken(fields[0], team)
		expectedDomain := replaceTeamToken(fields[1], team)

		// Compute the reverse lookup (PTR) domain.
		ptrDomain, err := reverseIP(expectedIP)
		if err != nil {
			return 0, false, fmt.Errorf("failed to compute PTR domain for %s: %v", expectedIP, err)
		}

		// Query for a PTR record.
		results, err := queryDNS(address, ptrDomain, dns.TypePTR)
		if err != nil {
			return 0, false, fmt.Errorf("DNS PTR query for %s failed: %v", ptrDomain, err)
		}

		// Normalize the expected domain as an FQDN.
		fqdnExpected := dns.Fqdn(expectedDomain)
		found := false
		for _, ptr := range results {
			if ptr == fqdnExpected {
				found = true
				break
			}
		}
		if !found {
			return 0, false, fmt.Errorf("external reverse lookup mismatch for %s: got %v, expected %s", expectedIP, results, fqdnExpected)
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, false, fmt.Errorf("error reading query file: %v", err)
	}

	return service.Award, true, nil
}

// ScoreDNSInternalFwd checks that for each line in the query file,
// a forward DNS query (A record) for the internal domain returns the expected internal IP.
// The team number is derived from the resolver’s third octet.
func ScoreDNSInternalFwd(service enum.Service, address string) (int, bool, error) {
	team, err := getTeamNumberFromAddress(address, "internal")
	if err != nil {
		return 0, false, err
	}

	f, err := os.Open(service.QFile)
	if err != nil {
		return 0, false, fmt.Errorf("failed to open query file: %v", err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			return 0, false, fmt.Errorf("invalid query file format: %s", line)
		}

		// For internal forward lookup, use the internal IP (field 3) and domain (field 4).
		expectedIP := replaceTeamToken(fields[2], team)
		domain := replaceTeamToken(fields[3], team)

		results, err := queryDNS(address, domain, dns.TypeA)
		if err != nil {
			return 0, false, fmt.Errorf("DNS A query for %s failed: %v", domain, err)
		}

		found := false
		for _, ip := range results {
			if ip == expectedIP {
				found = true
				break
			}
		}
		if !found {
			return 0, false, fmt.Errorf("internal forward lookup mismatch for %s: got %v, expected %s", domain, results, expectedIP)
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, false, fmt.Errorf("error reading query file: %v", err)
	}

	return service.Award, true, nil
}

// ScoreDNSInternalRev checks that for each line in the query file,
// a reverse DNS (PTR) query for the internal IP returns the expected internal domain.
// The team number is derived from the resolver’s third octet.
func ScoreDNSInternalRev(service enum.Service, address string) (int, bool, error) {
	team, err := getTeamNumberFromAddress(address, "internal")
	if err != nil {
		return 0, false, err
	}

	f, err := os.Open(service.QFile)
	if err != nil {
		return 0, false, fmt.Errorf("failed to open query file: %v", err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			return 0, false, fmt.Errorf("invalid query file format: %s", line)
		}

		// For internal reverse lookup, use the internal IP (field 3) and expected domain (field 4).
		expectedIP := replaceTeamToken(fields[2], team)
		expectedDomain := replaceTeamToken(fields[3], team)

		ptrDomain, err := reverseIP(expectedIP)
		if err != nil {
			return 0, false, fmt.Errorf("failed to compute PTR domain for %s: %v", expectedIP, err)
		}

		results, err := queryDNS(address, ptrDomain, dns.TypePTR)
		if err != nil {
			return 0, false, fmt.Errorf("DNS PTR query for %s failed: %v", ptrDomain, err)
		}

		fqdnExpected := dns.Fqdn(expectedDomain)
		found := false
		for _, ptr := range results {
			if ptr == fqdnExpected {
				found = true
				break
			}
		}
		if !found {
			return 0, false, fmt.Errorf("internal reverse lookup mismatch for %s: got %v, expected %s", expectedIP, results, fqdnExpected)
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, false, fmt.Errorf("error reading query file: %v", err)
	}

	return service.Award, true, nil
}
