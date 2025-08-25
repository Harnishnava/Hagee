# 🏗️ Standalone APK Build Guide (No EAS, No Server Required)

## Prerequisites
- Android Studio installed
- Android SDK configured
- Java JDK 17+ installed

## Step-by-Step Build Process

### 1. Clean Previous Builds
```powershell
# Stop all Gradle processes
cd android
.\gradlew --stop
cd ..

# Clean build directories
Remove-Item -Path "android\app\build" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "android\.gradle" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "android\app\.cxx" -Recurse -Force -ErrorAction SilentlyContinue
```

### 2. Generate Native Android Project
```powershell
npx expo prebuild --clean --platform android
```

### 3. Build JavaScript Bundle (Production Ready)
```powershell
# Create production bundle
npx expo export --platform android --output-dir dist

# OR use Metro bundler directly
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res
```

### 4. Build APK
```powershell
cd android

# For Debug APK (easier to install, larger size)
.\gradlew assembleDebug

# For Release APK (optimized, smaller size, needs signing)
.\gradlew assembleRelease

cd ..
```

### 5. Locate Your APK
- **Debug APK**: `android\app\build\outputs\apk\debug\app-debug.apk`
- **Release APK**: `android\app\build\outputs\apk\release\app-release.apk`

## Installation on Phone

### Method 1: Direct Install
1. Copy APK to your phone
2. Enable "Install from Unknown Sources" in Android Settings
3. Tap the APK file to install

### Method 2: ADB Install
```powershell
# Connect phone via USB with Developer Options enabled
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

## Troubleshooting

### If Build Fails:
1. Check Android SDK path in `android\local.properties`
2. Ensure Java JDK 17+ is installed
3. Run `.\gradlew --info assembleDebug` for detailed logs

### If APK Shows Blank Screen:
1. Ensure JavaScript bundle is included in APK
2. Check Metro bundler created the bundle correctly
3. Verify all native modules are properly linked

### Common Issues:
- **CMake errors**: Update Android NDK
- **Memory issues**: Increase Gradle heap size in `gradle.properties`
- **Permission errors**: Add required permissions to `app.json`

## Key Differences from Development Build
- ✅ Runs completely offline
- ✅ No Metro bundler required
- ✅ No laptop/server connection needed
- ✅ JavaScript bundle embedded in APK
- ✅ All assets included in APK

## File Sizes
- Debug APK: ~50-100MB (includes debug symbols)
- Release APK: ~20-50MB (optimized and compressed)
