package config

// Config structure for database configuration parameters
type DatabaseConfig struct {
	User     string
	Password string
	Host     string
	Port     int
	DBName   string
}

// YamlConfig is the root struct for the YAML configuration.
type YamlConfig struct {
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

// A service type used explicitly for scoring
type ScoringService struct {
	ID       int    // Corresponds to service_id in the database
	Name     string // Corresponds to service_name in the database
	BoxName  string // Corresponds to box_name in the database
	Disabled bool   // Corresponds to disabled in the database
}

// A team type used explicitly for scoring
type ScoringTeam struct {
	ID    int    // Corresponds to team_id in the database
	Name  string // Corresponds to team_name in the database
	Color string // Corresponds to team_color in the database
}
