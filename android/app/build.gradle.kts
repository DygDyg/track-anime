plugins { id("com.android.application") }

android {
    namespace = "ru.dygdyg.trackanime"
    compileSdk = 35
    defaultConfig {
        applicationId = "ru.dygdyg.trackanime"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "1.2.0"
    }
}

dependencies {
    implementation("androidx.core:core:1.15.0")
}
