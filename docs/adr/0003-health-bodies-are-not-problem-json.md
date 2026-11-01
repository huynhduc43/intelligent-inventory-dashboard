# Health endpoints keep Terminus's response body, not problem+json

Errors are RFC 9457 problem+json from one exception filter, but `/health/live` and `/health/ready` return Terminus's own JSON (`{ status, info, error, details }`), including on 503. Probes and orchestrators read the status code, and Terminus's shape is what Nest tooling expects; the driver error is redacted so no connection detail leaks. The exception filter must leave health responses untouched.
