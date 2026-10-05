pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
        google()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        // Compose Multiplatform depends on a few androidx JVM artifacts hosted on Google Maven.
        google()
    }
}

rootProject.name = "WebProPlayerDesktop"
