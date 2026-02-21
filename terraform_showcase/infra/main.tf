locals {
    teams = ["team1", "team2"]
    networks = {
        "Internal" = { octet1 = 192, octet2 = 168, octet3 = 1, octet4 = 0, mask = "255.255.255.0", cluster_id = 0, size = 254 }
    }
    routers = {
        "Router" = { interfaces = {"eth0" = { ip = "10.20.T.1", network = "External WAN"}, "eth1" = { ip = "192.168.1.1", network = "Internal"}}, network = "Internal", template_id = 2 }
    }
    servers = {
        "Web Server" = { ip = "192.168.1.10", network = "Internal", template_id = 0 }
    }
    infra_router = {
        "Competition Router" = { interfaces = {"eth0" = { ip = "", network = "Competition WAN"}, "eth1" = { ip = "10.20.0.1", network = "External WAN"}}, network = "External WAN", template_id = 1 }
    }
    infra_servers = {
    }
}
locals {
    comp_router_name = keys(local.infra_router)[0]
    comp_router = values(local.infra_router)[0]
}
module "infra-networks" {
    source = "../network-module"
    vnet = {
        network_name = "comp-network-Valid Network"
        octet1 = 10
        octet2 = 20
        octet3 = 0
        octet4 = 0
        mask = "255.255.255.0"
        size = 254
        cluster_ids = 0
    }
}
resource "opennebula_virtual_machine" "infra-routers" {
    keep_nic_order = true
    name = "comp-router-Valid Network"
    template_id = local.comp_router.template_id
    dynamic "nic" {
        for_each = local.comp_router.interfaces
        content {
            network_id = nic.value.network == "Competition WAN" ? 97 : module.infra-networks.id
            ip = nic.value.network == "Competition WAN" ? null : nic.value.ip
        }
    }
}
module "team-networks" {
    source = "../network-module"
    for_each = {
        for pair in setproduct(local.teams, keys(local.networks)):
        "${pair[0]}-${pair[1]}" => {
            network_name = "${pair[0]}-${pair[1]}"
            octet1 = local.networks[pair[1]].octet1
            octet2 = local.networks[pair[1]].octet2
            octet3 = local.networks[pair[1]].octet3
            octet4 = local.networks[pair[1]].octet4
            mask = local.networks[pair[1]].mask
            size = local.networks[pair[1]].size
            cluster_ids = local.networks[pair[1]].cluster_id
        }
    }
    vnet = each.value
}
resource "opennebula_virtual_machine" "team-routers" {
    depends_on = [module.team-networks, opennebula_virtual_machine.infra-routers]
    keep_nic_order = true
    for_each = {
        for pair in setproduct(local.teams, keys(local.routers)):
        "${pair[0]}-${pair[1]}" => {
            name = "${pair[0]}-${pair[1]}"
            router_name = pair[1]
            template_id = local.routers[pair[1]].template_id
            team_name = pair[0]
            team_number = replace(pair[0], "team", "")
        }
    }
    name = each.key
    template_id = each.value.template_id
    dynamic "nic" {
        for_each = local.routers[each.value.router_name].interfaces
        content {
            network_id = nic.value.network == "External WAN" ? module.infra-networks.id : module.team-networks["${each.value.team_name}-${nic.value.network}"].id
            ip = replace(nic.value.ip, "T", each.value.team_number)
        }
    }
}
resource "opennebula_virtual_machine" "team-servers" {
    depends_on = [resource.opennebula_virtual_machine.team-routers]
    keep_nic_order = true
    for_each = {
        for pair in setproduct(local.teams, keys(local.servers)):
        "${pair[0]}-${pair[1]}" => {
            name = "${pair[0]}-${pair[1]}"
            server_name = pair[1]
            template_id = local.servers[pair[1]].template_id
            team_name = pair[0]
            team_number = replace(pair[0], "team", "")
            team_network = local.servers[pair[1]].network
            ip = local.servers[pair[1]].ip
        }
    }
    name = each.key
    template_id = each.value.template_id
    nic {
        model="virtio"
        network_id = each.value.team_network == "External WAN" ? module.infra-networks.id : module.team-networks["${each.value.team_name}-${each.value.team_network}"].id
        ip = each.value.ip != "" ? replace(each.value.ip, "T", each.value.team_number) : null
    }
}
