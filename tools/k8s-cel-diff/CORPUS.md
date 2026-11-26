# Public CRD corpus for the Kubernetes differential and crash tests

Survey only. Nothing here is vendored yet; vendoring needs a maintainer's review of each license.
Surveyed 2026-11-24. Rule counts are `rule:` lines in the file on the named ref, so they include
nested ones (the count is a rough guide, not a parse).

| # | Source | Licence | Pin | Files to vendor (rule count) | Why it is useful |
|---|---|---|---|---|---|
| 1 | Gateway API, `kubernetes-sigs/gateway-api` | Apache-2.0 (repo licence) | tag `v1.7.0` | `config/crd/standard/gateway.networking.k8s.io_httproutes.yaml` (180), `..._gateways.yaml` (32), `..._grpcroutes.yaml` (34), `..._backendtlspolicies.yaml` (16), `..._listenersets.yaml` (7), `..._gatewayclasses.yaml` (2) | Biggest real corpus (about 270 rules). Many rules are list macros, `self.all(...)`, `exists`, and `oldSelf` transition rules, so it mostly tests the `server_only` fallback and that nothing crashes. |
| 2 | cert-manager, `cert-manager/cert-manager` | Apache-2.0 | a release tag (pick the latest at vendoring time; `master` was checked) | `deploy/crds/cert-manager.io_issuers.yaml` (1), `deploy/crds/cert-manager.io_clusterissuers.yaml` (1) | One rule each, the sum-of-ternaries "exactly one of tpp, cloud, ngts" form: `(has(self.tpp) ? 1 : 0) + (has(self.cloud) ? 1 : 0) + (has(self.ngts) ? 1 : 0) == 1`. This is the `exactly_one_of` row of the translation table, in the wild. The other cert-manager CRDs have no CEL rules. |
| 3 | Crossplane, `crossplane/crossplane` | Apache-2.0 | a release tag (`main` was checked) | `cluster/crds/apiextensions.crossplane.io_usages.yaml` (6), `cluster/crds/apiextensions.crossplane.io_compositions.yaml` (6), `cluster/crds/pkg.crossplane.io_providers.yaml` (2), `cluster/crds/ops.crossplane.io_operations.yaml` (3) | Short, simple rules such as `has(self.resourceRef) \|\| has(self.resourceSelector)` and `has(self.by) \|\| has(self.reason)`. These are `at_least_one_of` shapes and should translate. Same content under `cluster/crds/protection.crossplane.io_usages.yaml`. |
| 4 | Cluster API, `kubernetes-sigs/cluster-api` | Apache-2.0 | a release tag (`main` was checked) | `core/config/crd/bases/cluster.x-k8s.io_clusters.yaml` (5), `..._machinedrainrules.yaml` (4), `..._machinehealthchecks.yaml` (2), `..._machinedeployments.yaml` (1) | Small, mixed rules. Note the path: `core/config/crd/bases/`; the old `config/crd/bases/` path no longer exists on `main`. |
| 5 | Kubernetes docs examples, `kubernetes/website` | **CC-BY-4.0** for `content/` | n/a | `content/en/docs/reference/using-api/cel.md` and `content/en/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions.md` | Do not vendor. Prose is CC-BY-4.0, not Apache-2.0. Write our own fixtures that use the same rule shapes (the docs show `self.minReplicas <= self.replicas && self.replicas <= self.maxReplicas`, `self.replicas >= oldSelf.replicas`, and similar), and cite the page. |

## Suggested corpus

Vendor items 1 to 4 (only the files listed, schemas only, with the upstream `LICENSE` text and a
`SOURCE.md` giving repo, tag, path and licence in the vendored directory). That is about 14 files and
roughly 270 rules, most from Gateway API. Pin tags rather than `main` so a rebuild is repeatable.

Expected mix: the Crossplane and cert-manager rules should translate (`at_least_one_of`,
`exactly_one_of`); most Gateway API rules should be `server_only`. If the report shows many
Gateway API rules translated, check that the translation is not wrong.

## Things to check before vendoring

- Each repo's `LICENSE` is Apache-2.0 per the GitHub licence API (checked). Generated CRD YAML
  usually carries no per-file header; the repo licence applies. Keep upstream attribution and do
  not add our SPDX header to vendored files.
- Gateway API also ships `experimental/` CRDs with more rules; the `standard/` set is enough.
- The corpus must stay out of the published npm package (`files` is `dist`, `LICENSE`, `NOTICE`).
