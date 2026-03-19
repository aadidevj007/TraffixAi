#!/bin/bash

# Test Ingestion
echo "Ingesting sample document..."
curl -X POST http://localhost:8787/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Quantum Computing",
    "text": "Quantum computing is a type of computing that uses quantum-mechanical phenomena, such as superposition and entanglement. A quantum computer uses quantum bits, or qubits. Qubits can exist in multiple states simultaneously, unlike classical bits which are either 0 or 1. This allows quantum computers to perform certain calculations exponentially faster than classical computers."
  }'
echo -e "\n"

# Test Query
echo "Querying..."
curl -X POST http://localhost:8787/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How do qubits differ from classical bits?"
  }'
echo -e "\n"
