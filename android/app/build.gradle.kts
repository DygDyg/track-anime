import java.util.Properties

plugins { id("com.android.application") }

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.isFile) file.inputStream().use(::load)
}

fun localBuildConfigString(name: String): String =
    "\"${localProperties.getProperty(name, "").replace("\\", "\\\\").replace("\"", "\\\"")}\""

android {
    namespace = "ru.dygdyg.trackanime"
    compileSdk = 35

    defaultConfig {
        applicationId = "ru.dygdyg.trackanime"
        minSdk = 26
        targetSdk = 35
        versionCode = 18
        versionName = "1.3.9"
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
}
