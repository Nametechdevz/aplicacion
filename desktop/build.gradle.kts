import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    kotlin("jvm") version "2.1.20"
    kotlin("plugin.serialization") version "2.1.20"
    kotlin("plugin.compose") version "2.1.20"
    id("org.jetbrains.compose") version "1.7.3"
}

group = "com.webpro.player"
version = "1.0.0"

/*
 * The Xtream API client, parsers, cache, use cases and player state model are
 * shared with the Android app: they are compiled straight from ../app so both
 * platforms always run the same, tested logic.
 */
val sharedSources = "../app/src/main/java"
val sharedTests = "../app/src/test/java"

sourceSets {
    main {
        kotlin {
            srcDir(sharedSources)
            include("com/webpro/player/desktop/**")
            include("com/webpro/player/domain/**")
            include("com/webpro/player/data/api/**", "com/webpro/player/data/model/**")
            include(
                "com/webpro/player/data/repository/XtreamRepositoryImpl.kt",
                "com/webpro/player/data/repository/MemoryCache.kt"
            )
            include(
                "com/webpro/player/utils/UrlNormalizer.kt",
                "com/webpro/player/utils/TextNormalizer.kt",
                "com/webpro/player/utils/TimeFormat.kt",
                "com/webpro/player/utils/LogRedactor.kt"
            )
            // Pure Compose UI pieces shared with Android (theme, state model, cards).
            include("com/webpro/player/ui/theme/**", "com/webpro/player/ui/common/UiState.kt")
            include(
                "com/webpro/player/ui/components/FocusableCard.kt",
                "com/webpro/player/ui/components/AppLogo.kt",
                "com/webpro/player/ui/components/ScreenHeader.kt"
            )
            include(
                "com/webpro/player/player/PlaybackRequest.kt",
                "com/webpro/player/player/PlayerError.kt",
                "com/webpro/player/player/PlayerState.kt",
                "com/webpro/player/player/RetryPolicy.kt",
                "com/webpro/player/player/NetworkAdaptation.kt"
            )
        }
    }
    test {
        kotlin {
            srcDir(sharedTests)
            include("com/webpro/player/desktop/**")
            include("com/webpro/player/utils/**", "com/webpro/player/data/**", "com/webpro/player/domain/**")
            include("com/webpro/player/player/NetworkAdaptationTest.kt")
        }
    }
}

dependencies {
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    implementation(compose.materialIconsExtended)

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Playback engine: libVLC 3 through vlcj (decodes virtually every IPTV codec, incl. AC3/E-AC3/DTS/MP2 audio).
    implementation("uk.co.caprica:vlcj:4.12.1")

    testImplementation(compose.desktop.uiTestJUnit4)
    testImplementation(kotlin("test"))
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.1")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

tasks.test {
    useJUnit()
    systemProperty("java.awt.headless", "true")
    // Forward -Pwebpro.* properties (e.g. webpro.test.media, webpro.vlcDir) to the tests.
    project.properties.filterKeys { it.startsWith("webpro.") }.forEach { (key, value) -> systemProperty(key, value.toString()) }
    testLogging {
        events("failed")
        showStandardStreams = System.getenv("CI") != null
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

compose.desktop {
    application {
        mainClass = "com.webpro.player.desktop.MainKt"
        jvmArgs += listOf(
            "-Xms256m",
            "-Xmx1536m",
            "-XX:+UseG1GC",
            "-Dfile.encoding=UTF-8"
        )

        nativeDistributions {
            targetFormats(TargetFormat.Exe, TargetFormat.Msi)
            packageName = "WEBPRO PLAYER"
            packageVersion = "1.0.0"
            description = "Reproductor IPTV compatible con Xtream Codes"
            vendor = "WEBPRO"
            copyright = "© 2026 WEBPRO. Todos los derechos reservados."
            // Bundled libVLC (resources/windows/vlc) is copied next to the app by the installer.
            appResourcesRootDir.set(project.layout.projectDirectory.dir("resources"))
            includeAllModules = true

            windows {
                iconFile.set(project.file("packaging/icon.ico"))
                menuGroup = "WEBPRO PLAYER"
                shortcut = true
                menu = true
                dirChooser = true
                perUserInstall = false
                upgradeUuid = "6F2C5E7A-3B1D-4F8E-9A6C-2D4B8E1F7A90"
            }
            linux {
                iconFile.set(project.file("packaging/icon.png"))
            }
        }
    }
}
