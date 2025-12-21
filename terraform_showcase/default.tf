terraform {
    required_version = ">= 0.6.0"
    required_providers {
      opennebula = {
        source = "Opennebula/opennebula"
        version = ">= 1.0.0"
      }
    }
}

module "game" {
    source = "./infra"
}