#!/bin/sh
# Generates a self-signed TLS cert for local production-mode testing only -
# real production would use certs from an actual CA (Let's Encrypt, etc.),
# not this. Browsers will show a security warning for this cert; that's
# expected and correct behavior for a cert nothing has vouched for.
set -e
cd "$(dirname "$0")/certs"

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout key.pem -out cert.pem -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Generated proxy/certs/cert.pem and proxy/certs/key.pem"
