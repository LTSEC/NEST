package config

import (
	"fmt"
	"os"

	"github.com/go-yaml/yaml"
)

// The Yaml type is meant to store the data from a configuration yaml.
// Root struct for the YAML configuration
type Yaml struct {
	Boxes map[string]Box   `yaml:"boxes"`
	Teams map[string]Team  `yaml:"teams"`
	Admin map[string]Admin `yaml:"admins"`
}

// Box struct represents each individual box configuration
type Box struct {
	Ip       string             `yaml:"ip"`
	Services map[string]Service `yaml:"services"`
}

// Service struct represents each service configuration for a box
type Service struct {
	Username   string `yaml:"username,omitempty"`
	Password   string `yaml:"password,omitempty"`
	BtUsername string `yaml:"bt_username,omitempty"`
	BtPassword string `yaml:"bt_password,omitempty"`
	DBName     string `yaml:"db_name,omitempty"`
	DBPath     string `yaml:"db_path,omitempty"`
	Port       int    `yaml:"port"`
}

// Team struct represents each team's configuration
type Team struct {
	ID       int    `yaml:"id"`
	Name     string `yaml:"name"`
	Password string `yaml:"password"`
	Color    string `yaml:"color"`
}

// Admin struct represents the administrator user
type Admin struct {
	Login    string `yaml:"login"`
	Password string `yaml:"password"`
}

// Parse uses the go-yaml library in order to take information out of a .yaml config file and place into a Yaml struct.
// This is accomplished by opening the .yaml file and then using yaml.Unmarshal in order to import the information from the yaml.
// Parse then returns the struct.
func Parse(path string) *Yaml {

	file, err := os.ReadFile(path)
	if err != nil {
		fmt.Println("Failed to open the file: ", err)
	}

	var config Yaml

	if err := yaml.Unmarshal(file, &config); err != nil {
		fmt.Println("Failed to unmarshal the .yaml: ", err)
	}

	return &config
}
