@echo off
echo Building Android APK...

echo Step 1: Generating native code...
call npx expo prebuild --platform android

echo Step 2: Building APK...
cd android
call gradlew.bat clean
call gradlew.bat assembleDebug

echo Build completed!
echo APK location: android\app\build\outputs\apk\debug\app-debug.apk

cd ..
pause