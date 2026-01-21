package main

import (
	"context"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Println("Usage: param <region> <parameter-name>")
		os.Exit(1)
	}

	region := os.Args[1]
	paramName := os.Args[2]

	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(region))
	if err != nil {
		fmt.Println("Error loading AWS configuration:", err)
		os.Exit(1)
	}

	ssmSvc := ssm.NewFromConfig(cfg)

	param, err := ssmSvc.GetParameter(context.Background(), &ssm.GetParameterInput{
		Name: &paramName,
	})
	if err != nil {
		fmt.Println("Error getting parameter:", err)
		os.Exit(1)
	}

	fmt.Println(*param.Parameter.Value)
}
