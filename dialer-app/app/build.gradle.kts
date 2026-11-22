import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing: put the key outside the repo and point signing.properties
// (gitignored, next to this file's parent) at it:
//   storeFile=C:/…/android-signing-PRIVATE/growus-dialer.jks
//   storePassword=…   keyAlias=growus-dialer   keyPassword=…
val signing = Properties().apply {
    val f = rootProject.file("signing.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.growus.dialer"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.growus.dialer"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        // The ERP this app talks to. Override for testing: ./gradlew assembleDebug -PerpUrl=http://192.168.1.5:3000
        buildConfigField("String", "ERP_URL", "\"${(project.findProperty("erpUrl") as String?) ?: "https://www.growuserp.com"}\"")
    }

    signingConfigs {
        if (signing.getProperty("storeFile") != null) {
            create("release") {
                storeFile = file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
