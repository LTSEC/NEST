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
// Each game gets its own directory so multiple games can run simultaneously
// without conflicting state or lock files.
func GameWorkDir(baseDir string, gameID int) string {
	return filepath.Join(baseDir, fmt.Sprintf("game-%d", gameID))
}

// EnsureGameDir creates the per-game ansible directory structure and copies
// the provider/module configuration from the shared infra template.
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

// GenerateInventory creates an Ansible inventory YAML file from the game
// configuration. It expands per-team devices (substituting T with team numbers)
// and categorises hosts by OS type into standard_linux, vyos_routers, and
// mikrotik_routers groups. The resulting file is written to the game directory
// and its path is returned.
func GenerateInventory(gameDir string, game types.CyberGame) (string, error) {
	teamCount := game.TeamCount
	if teamCount == 0 {
		teamCount = 2
	}

	var standardLinux, vyosRouters, mikrotikRouters []string

	for teamNum := 1; teamNum <= teamCount; teamNum++ {
		teamStr := strconv.Itoa(teamNum)

		for _, device := range game.Devices {
			osName := strings.ToLower(device.OS.Name)

			if device.Type == "Router" {
				// Pick the infra-facing IP (the one containing T) so that the
				// ansible controller can reach the router on the WAN side.
				var ip string
				for _, ifIP := range device.Interfaces {
					if strings.Contains(ifIP, "T") {
						ip = strings.ReplaceAll(strings.Split(ifIP, "/")[0], "T", teamStr)
						break
					}
				}
				if ip == "" {
					continue
				}
				appendByOS(&standardLinux, &vyosRouters, &mikrotikRouters, osName, ip)
			} else if device.Type == "Server" {
				ip := device.IP
				if ip == "" { // DHCP — IP unknown until runtime
					continue
				}
				ip = strings.ReplaceAll(strings.Split(ip, "/")[0], "T", teamStr)
				appendByOS(&standardLinux, &vyosRouters, &mikrotikRouters, osName, ip)
			}
		}
	}

	// Include blackteam / infra servers.
	for _, bt := range game.BlackteamServices {
		if bt.IP != "" {
			standardLinux = append(standardLinux, bt.IP)
		}
	}

	// Build YAML inventory.
	var buf strings.Builder
	buf.WriteString("all:\n")
	buf.WriteString("  vars:\n")
	buf.WriteString("    ansible_user: root\n")
	buf.WriteString("    ansible_ssh_common_args: '-o StrictHostKeyChecking=no'\n")
	buf.WriteString("  children:\n")

	if len(standardLinux) > 0 {
		buf.WriteString("    standard_linux:\n")
		buf.WriteString("      hosts:\n")
		for _, ip := range standardLinux {
			fmt.Fprintf(&buf, "        %s:\n", ip)
		}
		buf.WriteString("      vars:\n")
		buf.WriteString("        ansible_user: root\n")
	}

	if len(vyosRouters) > 0 {
		buf.WriteString("    vyos_routers:\n")
		buf.WriteString("      hosts:\n")
		for _, ip := range vyosRouters {
			fmt.Fprintf(&buf, "        %s:\n", ip)
		}
		buf.WriteString("      vars:\n")
		buf.WriteString("        ansible_connection: network_cli\n")
		buf.WriteString("        ansible_network_os: vyos\n")
		buf.WriteString("        ansible_user: vyos\n")
		buf.WriteString("        ansible_password: vyos\n")
	}

	if len(mikrotikRouters) > 0 {
		buf.WriteString("    mikrotik_routers:\n")
		buf.WriteString("      hosts:\n")
		for _, ip := range mikrotikRouters {
			fmt.Fprintf(&buf, "        %s:\n", ip)
		}
		buf.WriteString("      vars:\n")
		buf.WriteString("        ansible_connection: network_cli\n")
		buf.WriteString("        ansible_network_os: routeros\n")
		buf.WriteString("        ansible_user: admin\n")
	}

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

// appendByOS appends an IP to the appropriate group slice based on OS name.
func appendByOS(linux, vyos, mikrotik *[]string, osName, ip string) {
	switch {
	case strings.Contains(osName, "vyos"):
		*vyos = append(*vyos, ip)
	case strings.Contains(osName, "mikrotik") || strings.Contains(osName, "routeros"):
		*mikrotik = append(*mikrotik, ip)
	default:
		*linux = append(*linux, ip)
	}
}
