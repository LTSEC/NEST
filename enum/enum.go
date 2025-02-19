package enum

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
	VirtualMachines         map[string]VirtualMachine         `yaml:"virtual-machines"`
	OfficialVirtualMachines map[string]OfficialVirtualMachine `yaml:"official-virtual-machines"`
	Teams                   map[string]Team                   `yaml:"teams"`
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
	Port int `yaml:"port"` // The port the service is running on

	// OPTIONALS
	// // SERVICE DEPENDENT
	User     string `yaml:"user,omitempty"`       // The username of a user for a service
	Password string `yaml:"password,omitempty"`   // The password of a user for a service
	QFile    string `yaml:"query_file,omitempty"` // The query file for a service
	QDir     string `yaml:"query_dir,omitempty"`  // The query directory for a service
	// // TRUE OPTIONAL
	Award   int  `yaml:"award,omitempty"`   // The awarded points for having a service up at scoring time
	Partial bool `yaml:"partial,omitempty"` // Whether or not partial points should be awarded
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
	VMName   string // Corresponds to box_name in the database
	Disabled bool   // Corresponds to disabled in the database
}

// A team type used explicitly for scoring
type ScoringTeam struct {
	ID    int    // Corresponds to team_id in the database
	Name  string // Corresponds to team_name in the database
	Color string // Corresponds to team_color in the database
}

// Official competition virtual machines
type OfficialVirtualMachine struct {
	IP string
}
