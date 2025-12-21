locals {
  teams = ["team1"]
  networks = {
    "ROUTER1 ETH1" = { octet1 = 172, octet2 = 25, octet3 = 255, octet4 = 0, mask = "255.255.255.0", cluster_id = 0, size = 254 }
  }
  routers = {
    "Router1" = { interfaces = {"eth0" = { ip = "10.20.1.1", network = "External WAN" }, "eth1" = { ip = "172.25.255.1", network = "ROUTER1 ETH1" }}, network = "ROUTER1 ETH1", template_id = 0 }
  }
  servers = {
    "vm1" = { ip = "true", network = "ROUTER1 ETH1", template_id = 0 }
  }
  infra_router = {
    "CompGatewayRouter" = { ip = {"eth0" = "{'ip': '', 'network': 'External WAN'}", "eth1" = "{'ip': '10.20.0.1', 'network': 'External WAN'}"}, network = "External WAN", template_id = 0 }
  }
}
module "team-networks" {
  source = "../network-module"
  for_each = {
    for pair in setproduct(local.teams, keys(local.networks)) :
    "${pair[0]}-${pair[1]}" => {
      network_name = "${pair[0]}-${pair[1]}"
      octet1       = local.networks[pair[1]].octet1
      octet2       = local.networks[pair[1]].octet2
      octet3       = local.networks[pair[1]].octet3
      octet4       = local.networks[pair[1]].octet4
      mask         = local.networks[pair[1]].mask
      size         = local.networks[pair[1]].size
      cluster_ids  = local.networks[pair[1]].cluster_id
    }
  }
  vnet = each.value
}
module "infra-networks" {
  source = "../network-module"
  vnet = {
    network_name = "External WAN"
    octet1       = 10
    octet2       = 20
    octet3       = 0
    octet4       = 0
    mask         = "255.255.0.0"
    size         = 65534
    cluster_ids  = 0
  }
}
resource "opennebula_virtual_machine" "team-routers" {
  depends_on = [module.team-networks]
  keep_nic_order = true
  for_each = {
    for pair in setproduct(local.teams, keys(local.routers)) :
    "${pair[0]}-${pair[1]}" => {
      name         = "${pair[0]}-${pair[1]}"
      router_name  = pair[1]
      template_id  = local.routers[pair[1]].template_id
    }
  }
  name        = each.key
  template_id = each.value.template_id
  dynamic "nic" {
    for_each = local.routers[each.value.router_name].interfaces
    content {
      network_id = nic.value.network == "External WAN" ? module.infra-networks.id : module.team-networks["${split("-", each.key)[0]}-${nic.value.network}"].id
      ip         = nic.value.ip
    }
  }
}
