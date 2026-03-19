#!/bin/bash

# Ingest Traffic Data
echo "Ingesting traffic regulations data..."
# Note: This is an example of ingesting one by one, for large sets you'd batch this.
curl -X POST http://localhost:8787/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Speeding Penalties",
    "text": "Exceeding the speed limit in a residential area is a primary traffic violation. Penalties typically include a fine ranging from $150 to $500 depending on the severity of the excess speed."
  }'

curl -X POST http://localhost:8787/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Red Light Violations",
    "text": "Failure to stop at a red light results in a 3-point penalty on the driver license and a standard fine of $250."
  }'

echo -e "\nIngestion complete.\n"

# Test 1: Drunk Driving
echo "Querying Drunk Driving penalties..."
curl -X POST http://localhost:8787/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the penalty for drunk driving in 2025?"
  }'
echo -e "\n"

# Test 2: Hit and Run (BNS)
echo "Querying Hit and Run laws (BNS 2023)..."
curl -X POST http://localhost:8787/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What happens if a driver causes an accident and flees without reporting?"
  }'
echo -e "\n"

# Test 3: Juvenile Offense
echo "Querying Juvenile Offenses..."
curl -X POST http://localhost:8787/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the penalty if a minor is caught driving?"
  }'
echo -e "\n"
