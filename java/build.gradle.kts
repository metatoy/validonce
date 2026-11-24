// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

plugins {
    id("org.springframework.boot") version "3.5.16" apply false
}

val publishedModules = listOf("validonce-core", "validonce-spring")

allprojects {
    repositories { mavenCentral() }
}

subprojects {
    plugins.withType<JavaPlugin> {
        extensions.configure<JavaPluginExtension> {
            toolchain { languageVersion = JavaLanguageVersion.of(21) }
        }
        tasks.withType<JavaCompile>().configureEach {
            options.release = 21
            options.encoding = "UTF-8"
            options.compilerArgs.add("-parameters")
        }
        tasks.withType<Test>().configureEach {
            useJUnitPlatform()
            testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
        }
    }
}

// ---- Publishing: a manual release by the founder. Nothing here signs or uploads on its own. ----
//
//   ./gradlew centralBundle                      unsigned dry run -> build/central/validonce-<version>-bundle.zip
//   ./gradlew centralBundle -Pvalidonce.sign     signs with the local gpg agent (founder's key), see docs/releasing.md

val sign = providers.gradleProperty("validonce.sign").isPresent
val stagingRepo = layout.buildDirectory.dir("staging-repo")

configure(subprojects.filter { it.name in publishedModules }) { pluginManager.withPlugin("java-library") {
    apply(plugin = "maven-publish")
    apply(plugin = "signing")

    extensions.configure<JavaPluginExtension> {
        withSourcesJar()
        withJavadocJar()
    }
    tasks.withType<Javadoc>().configureEach {
        (options as StandardJavadocDocletOptions).addStringOption("Xdoclint:none", "-quiet")
    }
    tasks.withType<Jar>().matching { it.name == "jar" }.configureEach {
        // LICENSE and NOTICE travel in the jar.
        from(rootDir.parentFile) {
            include("LICENSE", "NOTICE")
            into("META-INF")
        }
    }

    tasks.withType<PublishToMavenRepository>().configureEach {
        mustRunAfter(rootProject.tasks.named("cleanStaging"))
    }

    extensions.configure<PublishingExtension> {
        publications {
            create<MavenPublication>("maven") {
                from(components["java"])
                versionMapping {
                    usage("java-api") { fromResolutionOf("runtimeClasspath") }
                    usage("java-runtime") { fromResolutionResult() }
                }
                pom {
                    name = project.name
                    description = when (project.name) {
                        "validonce-core" -> "validonce rule model, evaluator and fluent builders for the JVM."
                        else -> "validonce for Spring Boot: Bean Validation constraint, springdoc x-validonce, 422 problem details."
                    }
                    url = "https://github.com/metatoy/validonce"
                    licenses {
                        license {
                            name = "Apache-2.0"
                            url = "https://www.apache.org/licenses/LICENSE-2.0.txt"
                        }
                    }
                    developers {
                        developer {
                            id = "metatoy"
                            name = "Metatoy LLC"
                            url = "https://metatoy.com"
                        }
                    }
                    scm {
                        url = "https://github.com/metatoy/validonce"
                        connection = "scm:git:https://github.com/metatoy/validonce.git"
                        developerConnection = "scm:git:ssh://git@github.com/metatoy/validonce.git"
                    }
                }
            }
        }
        repositories {
            maven {
                name = "staging"
                url = uri(stagingRepo)
            }
        }
    }

    if (sign) {
        extensions.configure<SigningExtension> {
            useGpgCmd()
            sign(extensions.getByType<PublishingExtension>().publications)
        }
    }
} }

val cleanStaging = tasks.register<Delete>("cleanStaging") { delete(stagingRepo) }

val centralBundle = tasks.register<Zip>("centralBundle") {
    group = "publishing"
    description = "Assembles a Central Portal bundle zip from a local staging repository (unsigned unless -Pvalidonce.sign)."
    val publishTasks = publishedModules.map { ":$it:publishMavenPublicationToStagingRepository" }
    dependsOn(cleanStaging, publishTasks)
    from(stagingRepo) { exclude("**/maven-metadata.xml*") }
    destinationDirectory = layout.buildDirectory.dir("central")
    archiveFileName = "validonce-${project.version}-bundle.zip"
}
