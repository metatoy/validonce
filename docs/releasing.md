# Releasing

How the packages are published. Every package publishes from a GitHub Actions workflow when a GitHub Release is published. npm, NuGet and PyPI use trusted publishing (OIDC), so no tokens are stored. Maven Central has no trusted publishing, so `publish-maven.yml` uses secrets in a protected environment. The Go module is published by a tag, which `publish-go.yml` pushes.

## Order

1. `node scripts/prepare-release.mjs X.Y.Z` sets the version everywhere (C#, TypeScript, Python, Java, the demo chart, the bug-report template) and turns the CHANGELOG's "## Unreleased" into the release heading. Open the release PR and merge it.
2. Publish the GitHub Release `vX.Y.Z` from `main`. This runs the npm, NuGet and PyPI workflows, which check the tag against the version and attach attested packages to the Release.
3. Go: nothing to do. `publish-go.yml` runs on the same Release: it tests the module, pushes `go/vX.Y.Z` on the Release's commit and fetches it through the Go module proxy. (For an older release, run it by hand with the release tag.)
4. Maven Central: `publish-maven.yml` runs on the same Release once you approve the deployment (see below).
5. Docs site, for a minor release (X.Y.0): freeze its docs with `node website/scripts/snapshot.mjs X.Y vX.Y.0` (after the tag exists), then open a PR with `website/versioned_docs/`, `website/versioned_sidebars/`, `website/versions.json` and `website/version-refs.json`. Once merged, validonce.metatoy.com shows X.Y as the default version and `main` stays under "Next". A patch release needs nothing unless a docs fix should reach the frozen copy.

## Maven Central

Two artifacts, `com.metatoy:validonce-core` and `com.metatoy:validonce-spring`, built from `java/` (Gradle, JDK 21). The version is `version` in `java/gradle.properties` (set by `prepare-release.mjs`).

`publish-maven.yml` publishes them when the GitHub Release is published. Maven Central has no token-free trusted publishing, so the job reads secrets from the protected **`maven-central`** environment. It is limited to `v*` tags and needs the founder's approval on every run: open the run and press "Review deployments". The job:

1. Checks the tag against `java/gradle.properties` and runs `./gradlew check`.
2. Builds the signed bundle (`./gradlew centralBundle -Pvalidonce.sign`), signing in memory with the CI signing key.
3. Attests it and uploads it to the Central Portal API with `publishingType=AUTOMATIC`, then waits until it is `PUBLISHED`.
4. Attaches the bundle to the Release.

For an older release, run it by hand with the release tag. CI's `java` job builds a signed bundle with a throwaway key on every push, so the signing path is tested without the secrets.

**Secrets** (environment `maven-central`, set once):

| Secret | What |
|---|---|
| `MAVEN_SIGNING_KEY` | ASCII-armored secret key of the **CI signing key** (`validonce CI <oss@metatoy.com>`, ed25519, signing only, 2-year expiry). It is not the founder's personal key. Fingerprint `E99C AF89 14E0 7E01 A9E9 8782 2CC3 5EBA 34E4 BF91`, expires 2028-11-23. Its public key is on keyserver.ubuntu.com and keys.openpgp.org. |
| `MAVEN_SIGNING_PASSWORD` | Its passphrase |
| `MAVEN_CENTRAL_USERNAME`, `MAVEN_CENTRAL_PASSWORD` | A Central Portal **user token** (central.sonatype.com, Account, Generate User Token), not the account login |

To rotate either secret: make a new key or token, update the secret, then revoke the old key (publish its revocation) or the old token.

**Manual fallback** (founder's Mac, signed with the local gpg agent): `cd java && ./gradlew centralBundle -Pvalidonce.sign`, then upload `build/central/validonce-<version>-bundle.zip` at <https://central.sonatype.com/publishing> ("Publish Component"). A published version can't be changed or removed.
