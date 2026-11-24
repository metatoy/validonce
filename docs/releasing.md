# Releasing

How the packages are published. npm, NuGet and PyPI publish from GitHub Actions (`publish-*.yml`). Maven Central is published by hand from the founder's Mac, because the signing key lives there. The Go module needs only a tag.

## Order

1. `node scripts/prepare-release.mjs X.Y.Z` sets the version everywhere (C#, TypeScript, Python, Java, the demo chart, the bug-report template) and turns the CHANGELOG's "## Unreleased" into the release heading. Open the release PR and merge it.
2. Publish the GitHub Release `vX.Y.Z` from `main`. This runs the npm, NuGet and PyPI workflows, which check the tag against the version and attach attested packages to the Release.
3. Go: push the tag `go/vX.Y.Z` on the same commit (`git tag go/vX.Y.Z <sha> && git push origin go/vX.Y.Z`). The Go module proxy picks it up on the first `go get`; check with `GOPROXY=https://proxy.golang.org go list -m github.com/metatoy/validonce/go@vX.Y.Z`.
4. Maven Central: the manual steps below.

## Maven Central (manual)

Two artifacts, `com.metatoy:validonce-core` and `com.metatoy:validonce-spring`, built from `java/` (Gradle, JDK 21). The version is `version` in `java/gradle.properties`.

**One-time setup** (done): a Sonatype Central Portal account, the `com.metatoy` namespace verified by DNS TXT record on metatoy.com (keep the record), and a GPG signing key published to a keyserver. `gpg` must be on the PATH with the key available in the agent.

**Each release:**

1. Set `version` in `java/gradle.properties` and make sure `./gradlew check` passes in `java/`.
2. Dry run, unsigned (CI does this too):

   ```sh
   cd java
   ./gradlew centralBundle
   ```

   This builds `build/central/validonce-<version>-bundle.zip` from a local staging repository, `build/staging-repo`: the jar, sources jar, javadoc jar, POM and Gradle module file of each artifact, with checksums. Check the POMs (license, scm, developer).
3. Signed bundle. Signing uses `gpg` through the local agent (`useGpgCmd()`), so the agent asks for the key's passphrase:

   ```sh
   ./gradlew centralBundle -Pvalidonce.sign
   ```

   The bundle now also holds a `.asc` signature for every file. Without `-Pvalidonce.sign` nothing is signed. If several keys are present, name one with `-Psigning.gnupg.keyName=<key id>`.
4. Upload `build/central/validonce-<version>-bundle.zip` at <https://central.sonatype.com/publishing> ("Publish Component"). Wait for validation, then press Publish.
5. Check `https://repo.maven.apache.org/maven2/com/metatoy/validonce-spring/<version>/` and that a clean Gradle project resolves `com.metatoy:validonce-spring:<version>`.

A published version cannot be changed or removed, so the dry run comes first. Nothing in the build uploads: no step above runs without the founder.
