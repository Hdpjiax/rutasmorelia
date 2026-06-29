# Instalar ViaMorelia en Android sin Metro ni API local

El APK **release** contiene el bundle JavaScript. No necesita `npm start`, Metro ni `npm run start:dev`. La app consulta Supabase y sus Edge Functions directamente, por lo que sólo requiere conexión a Internet.

## Instalar el APK ya generado

1. Copiar `apps/mobile/android/app/build/outputs/apk/release/app-release-arm64-v8a.apk` al teléfono por USB, Drive o correo.
2. En Android, abrir el archivo desde **Mis archivos**.
3. Si Android lo solicita, habilitar **Instalar apps desconocidas** únicamente para Mis archivos/Drive.
4. Pulsar **Instalar** y abrir **ViaMorelia**. No dejar ninguna terminal encendida.

## Generar una actualización sin usar terminal

1. Abrir Android Studio y seleccionar **Open**.
2. Elegir la carpeta `C:/RutasMorelia/apps/mobile/android`.
3. Esperar a que termine **Gradle Sync**.
4. Usar **Build > Generate Signed App Bundle or APK > APK**.
5. Seleccionar o crear una llave de firma privada y elegir la variante **release**.
6. Instalar el APK generado desde el teléfono como en los pasos anteriores.

Para publicar en Google Play, elegir **Android App Bundle** en el paso 4 y guardar la llave fuera del repositorio. No compartir archivos `.jks`, contraseñas ni tokens personales.
