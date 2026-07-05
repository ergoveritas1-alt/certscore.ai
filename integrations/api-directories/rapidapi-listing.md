# RapidAPI Listing Draft

Use this copy when creating a RapidAPI Hub listing after rate limits and billing posture are finalized.

## Name

CertScore API

## Short Description

Website risk-signal API for public-web scans, findings, Pulse summaries, and pre-consent cookies and trackers.

## Long Description

CertScore Pulse and API v2 expose automated public-web observations for website risk-signal review. Create or reuse public website scans, poll status, retrieve public-safe findings, inspect Pulse projections, look up latest-domain scans, and export pre-consent cookies and trackers as bounded JSON.

CertScore outputs are automated observations for review. They are not legal advice, certification, or a compliance determination.

## Category

Security

## Base URL

https://certscore.ai

## OpenAPI

https://certscore.ai/api/v2/openapi.json

## Auth

Bearer token. Self-serve API keys are available for signed-in verified users through `POST /api/v2/keys/request`; higher limits are available through support@certscore.ai.
