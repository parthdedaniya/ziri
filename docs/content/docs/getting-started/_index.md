---
title: Getting Started
weight: 10
---

**Production-grade LLM Gateway with Cedar-based Authorization**

ZIRI sits between your applications and LLM providers like OpenAI and Anthropic. When your app makes a request, ZIRI checks if it's allowed using Cedar policies, tracks costs, enforces rate limits, and logs everything. Then it forwards authorized requests to the actual provider.

Think of it as a smart proxy that adds enterprise features to any LLM API: access control, spending limits, rate limiting, and detailed audit logs.

## Explore

{{< cards >}}
{{< card link="introduction" title="Introduction" icon="lightning-bolt" subtitle="Learn what ZIRI is and how it works" >}}
{{< card link="installation" title="Installation" icon="download" subtitle="Get ZIRI up and running" >}}
{{< card link="quickstart" title="Quick Start" icon="lightning-bolt" subtitle="Make your first request in minutes" >}}
{{< card link="../api-reference" title="API Reference" icon="document-text" subtitle="Complete documentation for all endpoints" >}}
{{< card link="../sdk" title="SDK" icon="cube" subtitle="Zero-dependency client library for your apps" >}}
{{< card link="../guides/policy-examples" title="Guides" icon="academic-cap" subtitle="Policies, providers, user management" >}}
{{< /cards >}}

## What ZIRI Does

-   **Cedar-Based Authorization** — Control who can use which models and when using AWS Cedar policy language
-   **Rate Limiting** — Prevent abuse with per-user and per-key rate limits that persist across restarts
-   **Cost Tracking** — Track spending with full precision, set daily and monthly limits
-   **Audit Logging** — Every authorization decision logged with full context for compliance
-   **API Key Management** — Generate and rotate keys securely with automatic spend tracking
-   **Real-Time Updates** — Dashboard updates automatically using Server-Sent Events
-   **Docker Ready** — Production-ready Docker images with Docker Compose support

## Quick Start

{{< callout type="info" icon="lightning-bolt" >}}
Get ZIRI running in under a minute. Create a `docker-compose.yml` and run `docker compose up -d`.
{{< /callout >}}

Create a `docker-compose.yml` file:

```yaml {filename="docker-compose.yml"}
services:
    proxy:
        image: ziri/proxy:latest
        ports:
            - "3100:3100"
        volumes:
            - ziri-data:/data
        environment:
            - CONFIG_DIR=/data
            - PORT=3100
            - HOST=0.0.0.0
        restart: unless-stopped

volumes:
    ziri-data:
```

Start ZIRI:

```bash
docker compose up -d
```

The proxy server starts on `http://localhost:3100` with the management UI bundled.

## Next Steps

{{< cards cols="2" >}}
{{< card link="installation" title="Install ZIRI" icon="download" subtitle="Get ZIRI up and running" >}}
{{< card link="../guides/first-policy" title="Create Your First Policy" icon="shield-check" subtitle="Learn Cedar policy creation" >}}
{{< card link="../guides/provider-setup" title="Set Up Providers" icon="server" subtitle="Configure OpenAI, Anthropic, etc." >}}
{{< card link="../sdk" title="Use the SDK" icon="code" subtitle="Integrate ZIRI into your app" >}}
{{< /cards >}}

## Common Use Cases

{{< cards cols="2" >}}
{{< card link="../examples/real-world-scenarios" title="Multi-Tenant SaaS" icon="office-building" subtitle="Control access and costs per tenant" >}}
{{< card link="../guides/user-management" title="Enterprise Gateways" icon="users" subtitle="Centralize authorization across teams" >}}
{{< card link="../guides/policy-examples" title="Development Teams" icon="adjustments" subtitle="Prevent budget overruns with limits" >}}
{{< card link="../deployment/production" title="Production Apps" icon="chart-bar" subtitle="Compliance-ready audit logs" >}}
{{< /cards >}}
