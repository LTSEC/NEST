variable "vnet" {
    type = object ({
        network_name = string
        octet1 = number
        octet2 = number
        octet3 = number
        octet4 = number
        mask = string
        gateway = optional(string, "")
        cluster_ids = optional(number, 0)
        size = optional(number, 254)
        dns = optional(string, "")
    })
}