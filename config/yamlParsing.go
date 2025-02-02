package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-yaml/yaml"
)

// Config is the root struct for the YAML configuration.
type Config struct {
	VirtualMachines map[string]VirtualMachine `yaml:"virtual-machines"`
	Teams           map[string]Team           `yaml:"teams"`
}

// VirtualMachine represents a virtual machine configuration.
type VirtualMachine struct {
	IPSchema string             `yaml:"ip-schema"`
	Services map[string]Service `yaml:"services,omitempty"`
	Config   string             `yaml:"config,omitempty"`
}

// Service represents each service configuration for a virtual machine.
type Service struct {
	// REQUIRED
	Port int `yaml:"port"`

	// OPTIONALS
	// // SERVICE DEPENDENT
	DBName string `yaml:"db_name,omitempty"`
	DBPath string `yaml:"db_path,omitempty"`

	// // TRUE OPTIONAL
	Award string `yaml:"points,omitempty"`
}

// Team represents each team's configuration.
type Team struct {
	ID       int    `yaml:"id"`
	Name     string `yaml:"name"`
	Password string `yaml:"password"`
	Color    string `yaml:"color"`
}

// Parse loads and validates the configuration from the given YAML file path.
// It enforces that the main YAML has "virtual-machines" and "teams" sections,
// that there is at least one virtual machine, and that each virtual machine has a valid ip-schema
// and at least one service with a defined port (either inline or in an external config file).
func Parse(configsFolder, path string) (*Config, error) {
	// Read main YAML file.
	file, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open the file: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(file, &cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal the YAML: %w", err)
	}

	// Validate required top-level sections.
	if cfg.VirtualMachines == nil {
		return nil, errors.New(`configuration missing required "virtual-machines" section`)
	}
	if cfg.Teams == nil {
		return nil, errors.New(`configuration missing required "teams" section`)
	}

	// Ensure there is at least one virtual machine.
	if len(cfg.VirtualMachines) == 0 {
		return nil, errors.New("there must be at least one virtual machine defined")
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
func loadServicesFromConfig(configPath, vmName string) (map[string]Service, error) {
	serviceFile, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open config file %s for virtual machine %s: %w", configPath, vmName, err)
	}
	var services map[string]Service
	if err := yaml.Unmarshal(serviceFile, &services); err != nil {
		return nil, fmt.Errorf("failed to unmarshal services from config file %s for virtual machine %s: %w", configPath, vmName, err)
	}
	if err := validateServices(services, vmName); err != nil {
		return nil, err
	}
	return services, nil
}

// validateServices ensures that the provided services map contains at least one service with a nonzero port.
func validateServices(services map[string]Service, vmName string) error {
	if len(services) == 0 {
		return fmt.Errorf("virtual machine %s must have at least one service defined", vmName)
	}
	valid := false
	for svcName, svc := range services {
		if svc.Port != 0 {
			valid = true
		} else {
			return fmt.Errorf("service %s in virtual machine %s does not define a port", svcName, vmName)
		}
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
