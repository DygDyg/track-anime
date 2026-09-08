import java.util.Properties

plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.isFile) file.inputStream().use(::load)
}

fun localBuildConfigString(name: String): String =
    "\"${localProperties.getProperty(name, "").replace("\\", "\\\\").replace("\"", "\\\"")}\""

val googleServicesFile = file("google-services.json")
val googleServicesExample = file("google-services.json.example")
if (!googleServicesFile.exists() && googleServicesExample.exists()) {
    googleServicesExample.copyTo(googleServicesFile)
    logger.warn("Copied google-services.json.example → google-services.json (replace with Firebase Console download)")
}

android {
    namespace = "ru.dygdyg.trackanime"
    compileSdk = 35

    defaultConfig {
        applicationId = "ru.dygdyg.trackanime"
        minSdk = 26
        targetSdk = 35
        versionCode = 31
        versionName = "1.3.22"
        buildConfigField("String", "FALLBACK_PROXY_HOST", localBuildConfigString("trackAnimeProxyHost"))
        buildConfigField("int", "FALLBACK_PROXY_PORT", localProperties.getProperty("trackAnimeProxyPort", "0"))
        buildConfigField("String", "FALLBACK_PROXY_USERNAME", localBuildConfigString("trackAnimeProxyUsername"))
        buildConfigField("String", "FALLBACK_PROXY_PASSWORD", localBuildConfigString("trackAnimeProxyPassword"))
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        getByName("release") {
            // Keeps local test releases compatible with the already installed debug APK.
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
        }
    }
}

dependencies {
    implementation("androidx.core:core:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")
}
