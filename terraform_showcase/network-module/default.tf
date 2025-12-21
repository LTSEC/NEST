resource "opennebula_virtual_network" "network" {
    name                = var.vnet.network_name
    physical_device     = "eno1"
    type                = "vxlan"
    mtu                 = 9000
    security_groups     = [0]
    automatic_vlan_id   = true
    dns                 = var.vnet.dns != "" ? var.vnet.dns : "8.8.8.8"
    gateway             = var.vnet.gateway != "" ? var.vnet.gateway : "${var.vnet.octet1}.${var.vnet.octet2}.${var.vnet.octet3}.1"
    network_address     = "${var.vnet.octet1}.${var.vnet.octet2}.${var.vnet.octet3}.${var.vnet.octet4}"
    network_mask        = var.vnet.mask
    cluster_ids         = [var.vnet.cluster_ids]
}

resource "opennebula_virtual_network_address_range" "ar" {
    depends_on = [ opennebula_virtual_network.network ]

    virtual_network_id  = opennebula_virtual_network.network.id
    ar_type             = "IP4"
    size                = var.vnet.size
    ip4                 = "${var.vnet.octet1}.${var.vnet.octet2}.${var.vnet.octet3}.${var.vnet.octet4 + 1}"
}