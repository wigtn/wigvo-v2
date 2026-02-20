#!/bin/bash
# WIGVO Relay Server — 실시간 Cloud Run 로그 스트리밍
# Usage: ./tail-logs.sh

gcloud beta run services logs tail wigvo-relay \
  --region=asia-northeast3 \
  --log-filter='severity>=INFO AND NOT jsonPayload.logger=~"twilio.http" AND NOT jsonPayload.logger="uvicorn.access"'
