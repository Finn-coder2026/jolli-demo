packer {
	required_plugins {
		amazon = {
			source  = "github.com/hashicorp/amazon"
			version = "~> 1"
		}
	}
}

variable "aws_access_key" {
	type    = string
	default = ""
}

variable "aws_secret_key" {
	type    = string
	default = ""
}

variable "aws_source_ami" {
	type    = string
	default = "ami-05d6f3276c1388c05"
}

variable "user" {
	type    = string
	default = "node"
}

source "amazon-ebs" "main" {
	access_key                  = "${var.aws_access_key}"
	ami_name                    = "node aarch64 ${formatdate("YYYYMMDD_HHmm", timestamp())}"
	associate_public_ip_address = true
	instance_type               = "c8g.medium"
	launch_block_device_mappings {
		delete_on_termination = true
		device_name           = "/dev/xvda"
		encrypted             = true
		iops                  = 3000
		throughput            = 125
		volume_size           = 16
		volume_type           = "gp3"
	}
	region = "us-west-2"
	run_tags = {
		Name = "node-packer"
	}
	secret_key   = "${var.aws_secret_key}"
	source_ami   = "${var.aws_source_ami}"
	ssh_username = "admin"
	tags = {
		Name = "node"
	}
}

build {
	sources = ["source.amazon-ebs.main"]

	provisioner "shell" {
		execute_command   = "sudo -S sh -c '{{ .Vars }} {{ .Path }}'"
		expect_disconnect = true
		pause_after       = "30s"
		script            = "./scripts/base.sh"
	}

	provisioner "file" {
		destination = "/dev/shm/"
		sources = ["./upload/", "/tmp/param"]
	}

	provisioner "shell" {
		execute_command = "sudo -S sh -c '{{ .Vars }} {{ .Path }}'"
		script          = "./scripts/cloud.sh"
	}

	provisioner "shell" {
		environment_vars = ["USER=${var.user}"]
		execute_command = "sudo -S sh -c '{{ .Vars }} {{ .Path }}'"
		script          = "./scripts/user.sh"
	}

	provisioner "shell" {
		execute_command = "sudo -S sh -c '{{ .Vars }} {{ .Path }}'"
		script          = "./scripts/node.sh"
	}

	provisioner "shell" {
		execute_command = "sudo -S sh -c '{{ .Vars }} {{ .Path }}'"
		script          = "./scripts/swap.sh"
	}

	provisioner "shell" {
		execute_command = "sudo -S sh -c '{{ .Vars }} {{ .Path }}'"
		script          = "./scripts/tune.sh"
	}
}
