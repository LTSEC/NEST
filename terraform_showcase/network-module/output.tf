output "id" {
    depends_on = [ opennebula_virtual_network_address_range.ar ]
    value = opennebula_virtual_network.network.id
}