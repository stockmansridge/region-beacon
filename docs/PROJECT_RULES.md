# Project Rules — Event Passport SaaS

## Overview

This is a production white-label multi-tenant SaaS platform for regional event passports. It allows tourism organisations, event organisers, marketing agencies, wine regions, food festivals, and destination marketing groups to create QR-code-based visitor trails and competitions.

## Core Architecture

- **Multi-tenant**: The platform supports multiple agencies (tenants).
- **Agency-managed events**: Each agency can manage multiple events.
- **Event isolation**: Each event has its own branding, venues, QR codes, visitors, passports, check-ins and exports.
- **Mobile-first visitor experience**: Visitors use a browser-based experience. No app download is required.
- **No native apps**: Native iOS/Android apps are not part of Version 1.

## Feature Guardrails

### In Scope for MVP

See `MVP_SCOPE.md` for the exact list.

### Explicitly Out of Scope for Version 1

- Maps
- Offers / rewards
- Browser push notifications
- Social sharing features
- Team challenges
- CRM integrations
- Automated winner selection
- Advanced fraud scoring

### General Rule

Do not remove working features unless explicitly instructed.
