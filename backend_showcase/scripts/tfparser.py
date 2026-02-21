import json
import ipaddress
import argparse
import os

def map_ip_to_network(ip : str, networks: dict):
    try:
        ip_address = ipaddress.IPv4Address(ip)
        for name, net in networks.items():
            if ip_address in ipaddress.IPv4Network(net, strict=False):
                return name
    except ValueError:
        pass
    return None

def makeLocals(team_networks: dict, router_vms: dict, infra_router_vm: dict, server_vms: dict, infra_server_vms: dict, number_of_teams: int) -> str:
    teams = [f"team{i+1}" for i in range(number_of_teams)]
    teams_str = "[" + ", ".join(f"\"{t}\"" for t in teams) + "]"

    # Teams
    local_output = f"\
locals {{\n\
    teams = {teams_str}\n\
    networks = {{\n"
    for key,value in team_networks.items():
        local_output += f"\
        \"{key}\" = {{ octet1 = {value["octets"][0]}, octet2 = {value["octets"][1]}, octet3 = {value["octets"][2]}, octet4 = {value["octets"][3]}, mask = \"{value["mask"]}\", cluster_id = {value["cluster_id"]}, size = {value["size"]} }}\n"
    
    # Team Routers
    local_output += f"\
    }}\n\
    routers = {{\n"
    for key,value in router_vms.items():
        interfaces = "{" + ", ".join(f"\"{k}\" = {{ ip = \"{v["ip"]}\", network = \"{v["network"]}\"}}" for k, v in value["interfaces"].items()) + "}"
        local_output += f"\
        \"{key}\" = {{ interfaces = {interfaces}, network = \"{value["network"]}\", template_id = {value["template_id"]} }}\n"
    
    # Team Servers
    local_output += f"\
    }}\n\
    servers = {{\n"
    for key,value in server_vms.items():
        local_output += f"\
        \"{key}\" = {{ ip = \"{value["dhcp"]}\", network = \"{value["network"]}\", template_id = {value["template_id"]} }}\n"
    
    # Infra Routers
    local_output += f"\
    }}\n\
    infra_router = {{\n"
    for key,value in infra_router_vm.items():
        interfaces = "{" + ", ".join(f"\"{k}\" = {{ ip = \"{v["ip"]}\", network = \"{v["network"]}\"}}" for k, v in value["interfaces"].items()) + "}"
        local_output += f"\
        \"{key}\" = {{ interfaces = {interfaces}, network = \"{value["network"]}\", template_id = 2\n"

    # Infra Servers (black team)
    local_output += f"\
    }}\n\
    infra_servers = {{\n"
    for key,value in infra_server_vms.items():
        local_output += f"\
        \"{key}\" = {{ ip = \"{value["ip"]}\", template_id = {value["template_id"]} }}\n"
    local_output += f"\
    }}\n\
}}\n"

    if infra_router_vm:
        local_output += f"\
locals {{\n\
    comp_router_name = keys(local.infra_router)[0]\n\
    comp_router = values(local.infra_router)[0]\n\
}}\n"
    return local_output

def infra_network_module(infra_network: dict, game_name: str) -> str:
    Game_network_name, Game_network = next(iter(infra_network.items()))
    network_infra_template = f"\
module \"infra-networks\" {{\n\
    source = \"../network-module\"\n\
    vnet = {{\n\
        network_name = \"comp-network-{game_name}\"\n\
        octet1 = {Game_network["octets"][0]}\n\
        octet2 = {Game_network["octets"][1]}\n\
        octet3 = {Game_network["octets"][2]}\n\
        octet4 = {Game_network["octets"][3]}\n\
        mask = \"{Game_network["mask"]}\"\n\
        size = {Game_network["size"]}\n\
        cluster_ids = {Game_network["cluster_id"]}\n\
    }}\n\
}}\n"
    return network_infra_template

def infra_routers_module(game_name: str) -> str:
    infra_routers_template = f"\
resource \"opennebula_virtual_machine\" \"infra-routers\" {{\n\
    keep_nic_order = true\n\
    name = \"comp-router-{game_name}\"\n\
    template_id = local.comp_router.template_id\n\
    dynamic \"nic\" {{\n\
        for_each = local.comp_router.interfaces\n\
        content {{\n\
            network_id = nic.value.network == \"Competition WAN\" ? 97 : module.infra-networks.id\n\
            ip = nic.value.network == \"Competition WAN\" ? null : nic.value.ip\n\
        }}\n\
    }}\n\
}}\n"
    return infra_routers_template

def infra_servers_module(has_infra_router: bool) -> str:
    depends_on_str = "    depends_on = [opennebula_virtual_machine.infra-routers]\n" if has_infra_router else ""
    infra_servers_template = f"\
resource \"opennebula_virtual_machine\" \"infra-servers\" {{\n\
{depends_on_str}\
    for_each = local.infra_servers\n\
    name = each.key\n\
    template_id = each.value.template_id\n\
    nic {{\n\
        network_id = module.infra-networks.id\n\
        ip = each.value.ip\n\
        model = \"virtio\"\n\
    }}\n\
}}\n"
    return infra_servers_template

def team_network_module() -> str:
    network_team_template = f"\
module \"team-networks\" {{\n\
    source = \"../network-module\"\n\
    for_each = {{\n\
        for pair in setproduct(local.teams, keys(local.networks)):\n\
        \"${{pair[0]}}-${{pair[1]}}\" => {{\n\
            network_name = \"${{pair[0]}}-${{pair[1]}}\"\n\
            octet1 = local.networks[pair[1]].octet1\n\
            octet2 = local.networks[pair[1]].octet2\n\
            octet3 = local.networks[pair[1]].octet3\n\
            octet4 = local.networks[pair[1]].octet4\n\
            mask = local.networks[pair[1]].mask\n\
            size = local.networks[pair[1]].size\n\
            cluster_ids = local.networks[pair[1]].cluster_id\n\
        }}\n\
    }}\n\
    vnet = each.value\n\
}}\n"
    return network_team_template

def team_routers_module(has_infra_network: bool, has_infra_router: bool, has_infra_servers: bool, infra_network_name: str = "External WAN") -> str:
    if has_infra_network:
        # Use the provided infra_network_name for comparison
        network_id_line = f"nic.value.network == \"{infra_network_name}\" ? module.infra-networks.id : module.team-networks[\"${{each.value.team_name}}-${{nic.value.network}}\"].id"
    else:
        network_id_line = "module.team-networks[\"${each.value.team_name}-${nic.value.network}\"].id"

    depends_on_list = ["module.team-networks"]
    if has_infra_servers:
         depends_on_list.append("opennebula_virtual_machine.infra-servers")
    elif has_infra_router:
         depends_on_list.append("opennebula_virtual_machine.infra-routers")

    depends_on_str = "    depends_on = [" + ", ".join(depends_on_list) + "]\n"

    team_router_template = f"\
resource \"opennebula_virtual_machine\" \"team-routers\" {{\n\
{depends_on_str}\
    keep_nic_order = true\n\
    for_each = {{\n\
        for pair in setproduct(local.teams, keys(local.routers)):\n\
        \"${{pair[0]}}-${{pair[1]}}\" => {{\n\
            name = \"${{pair[0]}}-${{pair[1]}}\"\n\
            router_name = pair[1]\n\
            template_id = local.routers[pair[1]].template_id\n\
            team_name = pair[0]\n\
            team_number = replace(pair[0], \"team\", \"\")\n\
        }}\n\
    }}\n\
    name = each.key\n\
    template_id = each.value.template_id\n\
    dynamic \"nic\" {{\n\
        for_each = local.routers[each.value.router_name].interfaces\n\
        content {{\n\
            network_id = {network_id_line}\n\
            ip = replace(nic.value.ip, \"T\", each.value.team_number)\n\
        }}\n\
    }}\n\
}}\n"
    return team_router_template

def team_servers_module(has_infra_network: bool, infra_network_name: str = "External WAN") -> str:
    if has_infra_network:
        network_id_line = f"each.value.team_network == \"{infra_network_name}\" ? module.infra-networks.id : module.team-networks[\"${{each.value.team_name}}-${{each.value.team_network}}\"].id"
    else:
        network_id_line = "module.team-networks[\"${each.value.team_name}-${each.value.team_network}\"].id"

    server_vm_template = f"\
resource \"opennebula_virtual_machine\" \"team-servers\" {{\n\
    depends_on = [resource.opennebula_virtual_machine.team-routers]\n\
    keep_nic_order = true\n\
    for_each = {{\n\
        for pair in setproduct(local.teams, keys(local.servers)):\n\
        \"${{pair[0]}}-${{pair[1]}}\" => {{\n\
            name = \"${{pair[0]}}-${{pair[1]}}\"\n\
            server_name = pair[1]\n\
            template_id = local.servers[pair[1]].template_id\n\
            team_name = pair[0]\n\
            team_number = replace(pair[0], \"team\", \"\")\n\
            team_network = local.servers[pair[1]].network\n\
            ip = local.servers[pair[1]].ip\n\
        }}\n\
    }}\n\
    name = each.key\n\
    template_id = each.value.template_id\n\
    nic {{\n\
        model=\"virtio\"\n\
        network_id = {network_id_line}\n\
        ip = each.value.ip != \"\" ? replace(each.value.ip, \"T\", each.value.team_number) : null\n\
    }}\n\
}}\n"
    return server_vm_template

def Parse_device_JSON(data : json, network_map: dict, wan_network: list, infra_network_name: str) -> tuple[dict, dict, dict, dict]:
    infra_router = {}
    router_vms = {}
    server_vms = {}
    infra_server_vms = {}
    
    network_context = ""

    for vm in data["devices"]:
        name = vm["name"]
        template_id = vm["os"].get("id")
        if template_id is None:
             template_id = 2 # Default to VyOS (ID 2) if missing

        eth = {}

        if vm["type"] == "Router":
            interfaces = vm["interfaces"]
            for eth_name, eth_ip in interfaces.items():
                if "eth" in eth_name and eth_ip != None:
                    # Check if this interface matches the identified infra/WAN network
                    # Condition 1: eth0 and we have a known wan_network (legacy T detection)
                    # Condition 2: The network name matches the identified infra_network_name
                    if (infra_network_name and interfaces.get(eth_name) == infra_network_name) or ("eth0" in eth_name and wan_network):
                         # If it's a team router connecting to the infra network
                         if vm.get("hostId") is not None:
                             if wan_network: # Reconstruct IP from octets if T-parsing was used
                                 network = wan_network
                                 network[3] = str(vm["hostId"] or 0)
                                 ip = ".".join(str(octet) for octet in network)
                             else:
                                 # Standard IP (likely has a T in it from the JSON)
                                 ip = eth_ip.split("/")[0]

                             network_name = infra_network_name if infra_network_name else interfaces["eth0"]
                         else:
                             # Infra/Competition router
                             ip = ""
                             network_name = interfaces.get(eth_name)
                    else:
                        ip = eth_ip.split("/")[0]
                        if "T" in ip and infra_network_name:
                            # Sanitize T to 0 for mapping purposes if we know the infra network name
                            sanitized_ip = ip.replace("T", "0")
                            network_name = map_ip_to_network(sanitized_ip, network_map)
                            if network_name != infra_network_name:
                                # Fallback if mapping fails or mismatches (shouldn't happen if T logic is consistent)
                                network_name = map_ip_to_network(ip, network_map)
                        else:
                            network_name = map_ip_to_network(ip, network_map)

                    eth[eth_name] = {"ip": ip, "network": network_name}
                    network_context = network_name

                    if network_name is None:
                        raise ValueError(f"Interface {eth_name} on device {name} has IP {ip} but no matching network found.")
            
            # If the hostId is none, then it is considered the "Competition" router
            if vm.get("hostId") is None:
                host_id = vm["os"].get("id")
                infra_router[name] = {"interfaces": eth,
                                      "template_id": template_id,
                                      "host_id": host_id,
                                      "network": network_context}
            else:
                host_id = vm["os"].get("id")
                router_vms[name] = {"interfaces": eth,
                                    "template_id": template_id,
                                    "host_id": host_id,
                                    "network": network_context}
        if vm["type"] == "Server":
            dhcp = vm.get("dhcp", False)
            ip = "" if dhcp else vm.get("ip", "")

            server_network = network_context
            # Prefer the frontend-provided segment (exact team network name)
            segment = vm.get("segment", "")
            if segment and segment in network_map:
                server_network = segment
            elif ip:
                found_network = map_ip_to_network(ip, network_map)
                if found_network:
                    server_network = found_network

            server_vms[name] = {"template_id": template_id,
                                "dhcp": ip,
                                "network": server_network}

            if server_network is None and ip != "":
                 raise ValueError(f"Server {name} has IP {ip} but no matching network found.")
            
    for vm in data.get("blackteamServices", []):
        name = vm["name"]
        template_id = vm["templateId"]
        ip = vm["ip"]
        infra_server_vms[name] = {"template_id": template_id,
                                  "ip": ip}

    return router_vms, infra_router, server_vms, infra_server_vms
    
def CreateTerraform(data: json) -> None:
    infra_network = {}
    team_networks = {}
    network_map = {}
    number_of_teams = data.get("teamCount", 2)
    wan_network = []
    
    infra_network_name = ""

    game_name = data.get("name", "Game")

    # First pass: Identify networks and check for explicit 'T'
    for network in data["networks"]:
        name = network["name"]
        cidr = network["cidr"]
        ip, prefix = cidr.split('/')
        octets = ip.split('.')
        mask = str(ipaddress.IPv4Network(f"0.0.0.0/{prefix}").netmask)
        size = (2 ** (32 - int(prefix))) - 2

        if 'T' in octets:
            wan_network = octets
            octets = [0 if o == 'T' else int(o) for o in octets]
            infra_network[name] = {"octets": octets, 
                                "prefix": prefix, 
                                "mask": mask, 
                                "cluster_id": 0,
                                "size": size}
            infra_network_name = name
        else:
            octets = [int(o) for o in ip.split('.')]
            team_networks[name] = {"octets": octets, 
                                "prefix": prefix, 
                                "mask": mask, 
                                "cluster_id": 0,
                                "size": size}
        cidr = cidr.replace("T", "0")
        network_map[name] = cidr

    # Second pass: If no 'T' network found, check if routers imply one
    if not infra_network:
        for vm in data["devices"]:
            if vm["type"] == "Router" and vm.get("hostId") is not None:
                interfaces = vm["interfaces"]
                for eth_name, eth_ip in interfaces.items():
                    if eth_ip and "T" in eth_ip:
                        target_net_name = interfaces.get(eth_name)

                        if "T" in eth_ip:

                            ip_sanitized = eth_ip.split("/")[0].replace("T", "0")
                            found_net = map_ip_to_network(ip_sanitized, network_map)

                            if found_net and found_net in team_networks:
                                # Move from team_networks to infra_network
                                infra_network[found_net] = team_networks.pop(found_net)
                                infra_network_name = found_net
                                break
                if infra_network_name:
                    break

    router_vms, infra_router, server_vms, infra_server_vms = Parse_device_JSON(data, network_map, wan_network, infra_network_name)

    # Force inject competition router if it doesn't exist but infra network does
    if not infra_router and infra_network:
         gateway_ip = ""
         # Assuming gateway is .1 of the network
         if infra_network_name in infra_network:
             octets = infra_network[infra_network_name]["octets"]
             # Construct gateway IP: x.x.x.1
             # Note: octets is a list of ints.
             gateway_ip = f"{octets[0]}.{octets[1]}.{octets[2]}.1"

         infra_router["Competition Router"] = {
             "template_id": 1, # Default to 1 (VyOS or similar)
             "host_id": 1, # Dummy ID
             "network": infra_network_name,
             "interfaces": {
                 "eth0": { "ip": "", "network": "Competition WAN" },
                 "eth1": { "ip": gateway_ip, "network": infra_network_name }
             }
         }

    infra_router_template = ""
    if infra_router:
        infra_router_template = infra_routers_module(game_name)

    team_router_template = team_routers_module(bool(infra_network), bool(infra_router), bool(infra_server_vms), infra_network_name)
    team_servers_template = team_servers_module(bool(infra_network), infra_network_name)

    infra_servers_template = ""
    if infra_server_vms:
        infra_servers_template = infra_servers_module(bool(infra_router))

    local_template = makeLocals(team_networks, router_vms, infra_router, server_vms, infra_server_vms, number_of_teams)
    team_network_template = team_network_module()

    infra_network_template = ""
    if infra_network:
        infra_network_template = infra_network_module(infra_network, game_name)

    output_template = local_template + infra_network_template + infra_router_template + infra_servers_template + team_network_template + team_router_template + team_servers_template
    return output_template

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input", help="Input JSON File Name", type=str)
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) # basically its ../../
    output_dir = os.path.join(base_dir, "terraform_showcase", "infra")
    os.makedirs(output_dir, exist_ok=True)

    output_file = os.path.join(output_dir, "main.tf")

    with open(args.input, "r") as f:
        data = json.load(f)

    terraform = CreateTerraform(data)

    with open(output_file, "w") as f:
        f.write(terraform)
        
if __name__ == '__main__':
    main()
