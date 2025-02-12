package parser

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/LTSEC/NEST/enum"
	"github.com/LTSEC/NEST/services"
	"github.com/go-yaml/yaml"
)

// Parse loads and validates the configuration from the given YAML file path.
// It enforces that the main YAML has "virtual-machines" and "teams" sections,
// that there is at least one virtual machine, and that each virtual machine has a valid ip-schema
// and at least one service with a defined port (either inline or in an external config file).
func ParseYAML(configsFolder, path string) (*enum.YamlConfig, error) {
	// Read main YAML file.
	file, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open the file: %w", err)
	}

	var cfg enum.YamlConfig
	if err := yaml.Unmarshal(file, &cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal the YAML: %w", err)
	}

	// Validate required top-level sections.
	if cfg.VirtualMachines == nil {
		return nil, errors.New(`configuration missing required "virtual-machines" section`)
	}
	if cfg.OfficialVirtualMachines == nil {
		return nil, errors.New(`configuration missing required "official-virtual-machines" section`)
	}
	if cfg.Teams == nil {
		return nil, errors.New(`configuration missing required "teams" section`)
	}

	// Don't allow a team ID of 0 or less
	for _, team := range cfg.Teams {
		if team.ID <= 0 {
			return nil, errors.New(`configuration cannot have a team with id of "0" or less`)
		}
	}

	// Ensure there is at least one virtual machine.
	if len(cfg.VirtualMachines) == 0 {
		return nil, errors.New("there must be at least one virtual machine defined")
	}

	if len(cfg.OfficialVirtualMachines) < 3 {
		return nil, errors.New("there must be router, scorer, and dns official virtual machines defined")
	}

	// Check to make sure the three vms in OfficialVirtualMachines are named correctly
	required := []string{"router", "scorer", "dns"}
	var missing []string

	for _, key := range required {
		if _, ok := cfg.OfficialVirtualMachines[key]; !ok {
			missing = append(missing, key)
		}
	}

	if len(missing) > 0 {
		var quoted []string
		for _, m := range missing {
			quoted = append(quoted, "'"+m+"'")
		}
		return nil, fmt.Errorf("missing official VMs %s in config", strings.Join(quoted, ", "))
	}

	// Process each virtual machine.
	for vmName, vm := range cfg.VirtualMachines {
		// Validate the ip-schema.
		if err := validateIPSchema(vm.IPSchema); err != nil {
			return nil, fmt.Errorf("invalid ip-schema for virtual machine %s: %w", vmName, err)
		}

		// Validate service configuration.
		// If no inline services are defined, try to load them from the external config file.
		if len(vm.Services) == 0 {
			if vm.Config == "" {
				return nil, fmt.Errorf("virtual machine %s must define at least one service or provide a config file", vmName)
			}
			services, err := loadServicesFromConfig(filepath.Join(configsFolder, vm.Config), vmName)
			if err != nil {
				return nil, err
			}
			vm.Services = services
			cfg.VirtualMachines[vmName] = vm
		} else {
			// Ensure at least one service defines a port.
			if err := validateServices(vm.Services, vmName); err != nil {
				return nil, err
			}
		}
	}

	return &cfg, nil
}

// loadServicesFromConfig attempts to read an external YAML file specified by configPath,
// unmarshals it into a map of services, and validates that at least one service defines a port.
func loadServicesFromConfig(configPath, vmName string) (map[string]enum.Service, error) {
	serviceFile, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open config file %s for virtual machine %s: %w", configPath, vmName, err)
	}
	var services map[string]enum.Service
	if err := yaml.Unmarshal(serviceFile, &services); err != nil {
		return nil, fmt.Errorf("failed to unmarshal services from config file %s for virtual machine %s: %w", configPath, vmName, err)
	}
	if err := validateServices(services, vmName); err != nil {
		return nil, err
	}
	return services, nil
}

// validateServices ensures that the provided services map contains at least one service with a nonzero port.
func validateServices(yamlservices map[string]enum.Service, vmName string) error {
	if len(yamlservices) == 0 {
		return fmt.Errorf("virtual machine %s must have at least one service defined", vmName)
	}
	valid := false
	for svcName, svc := range yamlservices {
		// Check is its a valid service
		if _, ok := services.ScoringDispatch[svcName]; !ok {
			return fmt.Errorf("unknown service type '%s' in virtual machine %s", svcName, vmName)
		}

		// Check if there is a port
		if svc.Port == 0 {
			return fmt.Errorf("service %s in virtual machine %s does not define a port", svcName, vmName)
		}

		// Define a default award
		if svc.Award == 0 {
			svc.Award = 1
		}

		// If everything is valid, we're good
		valid = true
	}
	if !valid {
		return fmt.Errorf("virtual machine %s must have at least one service with a defined port", vmName)
	}
	return nil
}

// validateIPSchema checks that the ip-schema is in the correct format.
// It requires 4 octets separated by dots where:
//   - The first and second octet must be valid numbers.
//   - The third and fourth octet: each must be either a valid number or the letter "T" (case-insensitive),
//     but only one of these two octets can be "T".
func validateIPSchema(ip string) error {
	parts := strings.Split(ip, ".")
	if len(parts) != 4 {
		return fmt.Errorf("ip-schema must have 4 octets, got %d", len(parts))
	}
	// Validate first and second octets are numbers.
	for i := 0; i < 2; i++ {
		if _, err := strconv.Atoi(parts[i]); err != nil {
			return fmt.Errorf("octet %d (%s) is not a valid number", i+1, parts[i])
		}
	}
	// Validate third and fourth octets.
	tCount := 0
	for i := 2; i < 4; i++ {
		if strings.EqualFold(parts[i], "T") {
			tCount++
		} else {
			if _, err := strconv.Atoi(parts[i]); err != nil {
				return fmt.Errorf("octet %d (%s) is not a valid number or 'T'", i+1, parts[i])
			}
		}
	}
	if tCount > 1 {
		return fmt.Errorf("only one of the third or fourth octet can be 'T'")
	}
	return nil
}
