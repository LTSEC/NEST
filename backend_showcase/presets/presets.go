package presets

import "NESTBackendShowcase/types"

func intPtr(i int) *int {
	return &i
}

var Presets = map[string]types.CyberGame{
	"Test Network": {
		Networks: []types.Network{
			{Name: "internal", CIDR: "192.168.1.0/24"},
		},
		Devices: []types.Device{
			{
				Name:   "Router",
				Type:   "Router",
				OS:     types.OSInfo{ID: 1, Name: "VyOS"},
				HostID: intPtr(10),
				Interfaces: map[string]string{
					"eth0": "External WAN",
					"eth1": "192.168.1.1/24",
				},
				ServiceConfigs: map[string]types.ServiceConfig{},
			},
			{
				Name:      "Server",
				Type:      "Server",
				OS:        types.OSInfo{ID: 2, Name: "Debian"},
				IP:        "192.168.1.10",
				Router:    "Router",
				Interface: "eth1",
				ServiceConfigs: map[string]types.ServiceConfig{},
			},
		},
		BlackteamServices: []types.BlackteamService{},
		Applications:      []types.Application{},
	},
	"Basic Network": {
		Networks: []types.Network{
			{Name: "internal", CIDR: "192.168.1.0/24"},
		},
		Devices: []types.Device{
			{
				Name:   "Router",
				Type:   "Router",
				OS:     types.OSInfo{ID: 1, Name: "VyOS"},
				HostID: intPtr(10),
				Interfaces: map[string]string{
					"eth0": "External WAN",
					"eth1": "192.168.1.1/24",
				},
				ServiceConfigs: map[string]types.ServiceConfig{},
			},
			{
				Name:      "Web Server",
				Type:      "Server",
				OS:        types.OSInfo{ID: 2, Name: "Debian"},
				IP:        "192.168.1.10",
				Router:    "Router",
				Interface: "eth1",
				ServiceConfigs: map[string]types.ServiceConfig{
					"http": {Port: 80, Protocol: "tcp"},
				},
			},
			{
				Name:      "DB Server",
				Type:      "Server",
				OS:        types.OSInfo{ID: 2, Name: "Debian"},
				IP:        "192.168.1.11",
				Router:    "Router",
				Interface: "eth1",
				ServiceConfigs: map[string]types.ServiceConfig{
					"postgres": {Port: 5432, Protocol: "tcp"},
				},
			},
		},
		BlackteamServices: []types.BlackteamService{},
		Applications:      []types.Application{},
	},
}
