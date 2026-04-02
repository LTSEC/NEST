package ansiblerunner

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"NESTBackendShowcase/logger"
	"NESTBackendShowcase/types"
)

// GameWorkDir returns the per-game ansible working directory.
func GameWorkDir(baseDir string, gameID int) string {
	return filepath.Join(baseDir, fmt.Sprintf("game-%d", gameID))
}

// EnsureGameDir creates the per-game ansible directory structure.
func EnsureGameDir(baseDir string, gameID int) (string, error) {
	dir := GameWorkDir(baseDir, gameID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("mkdir game dir: %w", err)
	}
	return dir, nil
}

// CleanupGameDir removes a per-game ansible directory after destruction.
func CleanupGameDir(baseDir string, gameID int) error {
	dir := GameWorkDir(baseDir, gameID)
	return os.RemoveAll(dir)
}

// inventoryHost represents a single host entry in the generated inventory.
type inventoryHost struct {
	Name    string // unique key in the YAML (IP or "teamN-deviceName")
	IP      string // ansible_host value (only set when Name != IP)
	SSHArgs string // per-host ansible_ssh_common_args override (jump host)
}

// GenerateInventory creates an Ansible inventory YAML file from the game
// configuration. It expands per-team devices (substituting T with team numbers),
// categorises hosts by OS type, and adds ProxyCommand jump-host directives for
// servers behind team routers on isolated LANs.
func GenerateInventory(gameDir string, game types.CyberGame) (string, error) {
	teamCount := game.TeamCount
	if teamCount == 0 {
		teamCount = 2
	}

	// --- Identify the infra/WAN network (the one with T in its CIDR) ---
	var wanNetworkName string
	var wanOctets []string
	for _, net := range game.Networks {
		ip := strings.Split(net.CIDR, "/")[0]
		octets := strings.Split(ip, ".")
		for _, o := range octets {
			if o == "T" {
				wanNetworkName = net.Name
				wanOctets = make([]string, len(octets))
				copy(wanOctets, octets)
				break
			}
		}
		if wanNetworkName != "" {
			break
		}
	}

	// --- Resolve each router's WAN IP template (still contains T) ---
	// routerWANTemplate maps device name → IP template like "10.20.T.2"
	routerWANTemplate := make(map[string]string)
	routerOS := make(map[string]string)

	for _, device := range game.Devices {
		if device.Type != "Router" {
			continue
		}
		routerOS[device.Name] = strings.ToLower(device.OS.Name)

		for _, ifValue := range device.Interfaces {
			// Case 1: value is a network name that matches the T-network.
			// Compute the IP from the WAN CIDR octets + the router's hostId.
			if ifValue == wanNetworkName && wanOctets != nil && device.HostID != nil {
				octets := make([]string, len(wanOctets))
				copy(octets, wanOctets)
				octets[len(octets)-1] = strconv.Itoa(*device.HostID)
				routerWANTemplate[device.Name] = strings.Join(octets, ".")
				break
			}
			// Case 2: value is a raw IP containing T (e.g. "10.20.T.2/24").
			ip := strings.Split(ifValue, "/")[0]
			if strings.Contains(ip, "T") {
				routerWANTemplate[device.Name] = ip
				break
			}
		}
	}

	// --- Default SSH password from game credentials ---
	defaultPassword := "changeme"
	if len(game.Credentials) > 0 {
		defaultPassword = game.Credentials[0].Password
	}

	// --- Build per-team host lists ---
	var standardLinux, vyosRouters, mikrotikRouters []inventoryHost

	for teamNum := 1; teamNum <= teamCount; teamNum++ {
		teamStr := strconv.Itoa(teamNum)

		// Routers — reachable on their WAN IP.
		for _, device := range game.Devices {
			if device.Type != "Router" {
				continue
			}
			tmpl, ok := routerWANTemplate[device.Name]
			if !ok {
				continue
			}
			ip := strings.ReplaceAll(tmpl, "T", teamStr)
			host := inventoryHost{Name: ip}
			appendHostByOS(&standardLinux, &vyosRouters, &mikrotikRouters,
				strings.ToLower(device.OS.Name), host)
		}

		// Servers — may need a jump host if behind a team router.
		for _, device := range game.Devices {
			if device.Type != "Server" {
				continue
			}
			ip := device.IP
			if ip == "" { // DHCP — unknown until runtime
				continue
			}
			ip = strings.ReplaceAll(strings.Split(ip, "/")[0], "T", teamStr)
			osName := strings.ToLower(device.OS.Name)

			// If the server has a designated router, it sits on an isolated
			// team LAN and needs a ProxyCommand through the team router.
			if device.Router != "" {
				if routerTmpl, ok := routerWANTemplate[device.Router]; ok {
					routerIP := strings.ReplaceAll(routerTmpl, "T", teamStr)

					// Determine jump-host SSH user & password based on router OS.
					jumpUser, jumpPass := jumpCredentials(routerOS[device.Router])

					// Use a unique hostname so duplicate LAN IPs don't collide.
					hostName := fmt.Sprintf("team%d-%s", teamNum,
						strings.ReplaceAll(device.Name, " ", "-"))

					sshArgs := fmt.Sprintf(
						"-o StrictHostKeyChecking=no -o ProxyCommand=\"sshpass -p %s ssh -o StrictHostKeyChecking=no -W %%h:%%p %s@%s\"",
						jumpPass, jumpUser, routerIP)

					host := inventoryHost{Name: hostName, IP: ip, SSHArgs: sshArgs}
					appendHostByOS(&standardLinux, &vyosRouters, &mikrotikRouters, osName, host)
					continue
				}
			}

			// Directly reachable (on WAN or no router assigned).
			host := inventoryHost{Name: ip}
			appendHostByOS(&standardLinux, &vyosRouters, &mikrotikRouters, osName, host)
		}
	}

	// Blackteam / infra servers (not per-team).
	for _, bt := range game.BlackteamServices {
		if bt.IP != "" {
			standardLinux = append(standardLinux, inventoryHost{Name: bt.IP})
		}
	}

	// --- Render YAML ---
	var buf strings.Builder
	buf.WriteString("all:\n")
	buf.WriteString("  vars:\n")
	buf.WriteString("    ansible_user: root\n")
	fmt.Fprintf(&buf, "    ansible_password: %s\n", defaultPassword)
	buf.WriteString("    ansible_ssh_common_args: '-o StrictHostKeyChecking=no'\n")
	buf.WriteString("  children:\n")

	writeHostGroup(&buf, "standard_linux", standardLinux, map[string]string{
		"ansible_user": "root",
	})
	writeHostGroup(&buf, "vyos_routers", vyosRouters, map[string]string{
		"ansible_connection": "network_cli",
		"ansible_network_os": "vyos",
		"ansible_user":       "vyos",
		"ansible_password":   "vyos",
	})
	writeHostGroup(&buf, "mikrotik_routers", mikrotikRouters, map[string]string{
		"ansible_connection": "network_cli",
		"ansible_network_os": "routeros",
		"ansible_user":       "admin",
	})

	inventoryPath := filepath.Join(gameDir, "inventory.yml")
	if err := os.WriteFile(inventoryPath, []byte(buf.String()), 0o644); err != nil {
		return "", fmt.Errorf("write inventory: %w", err)
	}

	return inventoryPath, nil
}

// RunAnsible executes the main.yml playbook from ansibleDir against the
// provided inventory file, streaming all output to logCh.
func RunAnsible(ansibleDir string, inventoryPath string, logCh chan string) error {
	ansibleBin, err := exec.LookPath("ansible-playbook")
	if err != nil {
		return fmt.Errorf("ansible-playbook not found in PATH: %w", err)
	}

	logCh <- fmt.Sprintf("[INFO] Found ansible-playbook at: %s", ansibleBin)
	logCh <- fmt.Sprintf("[INFO] Using inventory: %s", inventoryPath)

	playbookPath := filepath.Join(ansibleDir, "main.yml")
	logCh <- fmt.Sprintf("[INFO] Running playbook: %s", playbookPath)

	cmd := exec.Command(ansibleBin, "-i", inventoryPath, playbookPath)
	cmd.Dir = ansibleDir
	cmd.Env = append(os.Environ(),
		"ANSIBLE_HOST_KEY_CHECKING=False",
		"ANSIBLE_FORCE_COLOR=true",
	)
	cmd.Stdout = logger.NewLogWriter(logCh, os.Stdout, "[ANSIBLE]: ")
	cmd.Stderr = logger.NewLogWriter(logCh, os.Stderr, "[ANSIBLE ERR]: ")

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ansible-playbook failed: %w", err)
	}

	return nil
}

// writeHostGroup writes a single inventory group to buf if hosts is non-empty.
func writeHostGroup(buf *strings.Builder, groupName string, hosts []inventoryHost, groupVars map[string]string) {
	if len(hosts) == 0 {
		return
	}
	fmt.Fprintf(buf, "    %s:\n", groupName)
	buf.WriteString("      hosts:\n")
	for _, h := range hosts {
		fmt.Fprintf(buf, "        %s:\n", h.Name)
		if h.IP != "" {
			fmt.Fprintf(buf, "          ansible_host: %s\n", h.IP)
		}
		if h.SSHArgs != "" {
			fmt.Fprintf(buf, "          ansible_ssh_common_args: '%s'\n", h.SSHArgs)
		}
	}
	if len(groupVars) > 0 {
		buf.WriteString("      vars:\n")
		for k, v := range groupVars {
			fmt.Fprintf(buf, "        %s: %s\n", k, v)
		}
	}
}

// appendHostByOS appends a host to the appropriate group based on OS name.
func appendHostByOS(linux, vyos, mikrotik *[]inventoryHost, osName string, host inventoryHost) {
	switch {
	case strings.Contains(osName, "vyos"):
		*vyos = append(*vyos, host)
	case strings.Contains(osName, "mikrotik") || strings.Contains(osName, "routeros"):
		*mikrotik = append(*mikrotik, host)
	default:
		*linux = append(*linux, host)
	}
}

// jumpCredentials returns the SSH user and password for a jump host based on
// the router's OS name.
func jumpCredentials(osName string) (user, pass string) {
	switch {
	case strings.Contains(osName, "vyos"):
		return "vyos", "vyos"
	case strings.Contains(osName, "mikrotik") || strings.Contains(osName, "routeros"):
		return "admin", ""
	default:
		return "root", "changeme"
	}
}
