# WS Client Scoped Routing Verification

This private branch must pass the repository test suite and typecheck, the ARM64 packaging helper tests, and the normal workspace build before promotion to the clean feature branch.

The verified behavior includes group/private filtering compatibility, group-scoped keyword filtering, per-client group-scoped prefix routing with prefix stripping, independent routing for multiple WS clients, and preservation of the Raspberry Pi ARM64 packaging path.
