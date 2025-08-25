#!/bin/bash

# Build Docker image
docker build -t google-classroom-login .

# Tag for your registry (replace with your registry)
docker tag google-classroom-login your-registry.com/google-classroom-login:latest

# Push to registry
docker push your-registry.com/google-classroom-login:latest

echo "Image pushed! Deploy in Coolify using: your-registry.com/google-classroom-login:latest"