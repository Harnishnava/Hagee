@echo off
echo "🔧 Fixing White Screen in APK..."

echo "Step 1: Creating assets directory..."
if not exist "android\app\src\main\assets" mkdir "android\app\src\main\assets"

echo "Step 2: Bundling JavaScript for production..."
npx react-native bundle --platform android --dev false --entry-file node_modules/expo-router/entry.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res

echo "Step 3: Rebuilding APK with JavaScript bundle..."
cd android
call gradlew clean
call gradlew assembleDebug
cd ..

echo "✅ Fixed APK with JavaScript bundle!"
echo "📱 New APK: android\app\build\outputs\apk\debug\app-debug.apk"

if exist "android\app\src\main\assets\index.android.bundle" (
    echo "✅ JavaScript bundle created successfully!"
    dir "android\app\src\main\assets\index.android.bundle" | find "index.android.bundle"
) else (
    echo "❌ JavaScript bundle creation failed!"
)

pause
