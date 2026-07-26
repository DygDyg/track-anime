plugins { id("com.android.application") }

android {
    namespace = "ru.dygdyg.trackanime"
    compileSdk = 35
    defaultConfig {
        applicationId = "ru.dygdyg.trackanime"
        minSdk = 26
        targetSdk = 35
        versionCode = 7
        versionName = "1.2.2"
    }

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
}
