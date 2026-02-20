package presets

import "NESTBackendShowcase/types"

func intPtr(i int) *int {
	return &i
}

var Presets = map[string]types.CyberGame{
	"Test Network": {
		Networks: []types.Network{
			{Name: "internal", CIDR: "192.168.0.0/16"},
		},
		Devices: []types.Device{
			{
				Name:   "Router",
				Type:   "Router",
				OS:     types.OSInfo{ID: 1, Name: "VyOS"},
				HostID: intPtr(10), // Assuming ID 10
				Interfaces: map[string]string{
					"eth0": "192.168.1.1",
				},
			},
			{
				Name: "Server",
				Type: "Server",
				OS:   types.OSInfo{ID: 2, Name: "Debian"},
				IP:   "192.168.1.10",
			},
		},
		BlackteamServices: []types.BlackteamService{},
		Applications:      []types.Application{},
		LDAPZones:         []types.LDAPZone{},
	},
	"Basic Network": {
		Networks: []types.Network{
			{Name: "internal", CIDR: "192.168.0.0/16"},
		},
		Devices: []types.Device{
			{
				Name:   "Router",
				Type:   "Router",
				OS:     types.OSInfo{ID: 1, Name: "VyOS"},
				HostID: intPtr(10),
				Interfaces: map[string]string{
					"eth0": "192.168.1.1",
				},
			},
			{
				Name: "Web Server",
				Type: "Server",
				OS:   types.OSInfo{ID: 2, Name: "Debian"},
				IP:   "192.168.1.10",
				Services: map[string]int{
					"http": 80,
				},
			},
			{
				Name: "DB Server",
				Type: "Server",
				OS:   types.OSInfo{ID: 2, Name: "Debian"},
				IP:   "192.168.1.11",
				Services: map[string]int{
					"postgres": 5432,
				},
			},
		},
		BlackteamServices: []types.BlackteamService{},
		Applications:      []types.Application{},
		LDAPZones:         []types.LDAPZone{},
	},
}
