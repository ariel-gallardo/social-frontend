# Social Network — Frontend

Cliente web de la red social con chat en tiempo real, amigos, historias y carga de imágenes.

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Framework | Angular 21 (standalone components) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS |
| API GraphQL | Apollo Angular |
| Tiempo real | @stomp/stompjs + WebSocket |
| Subida de imágenes | HTTP multipart → AWS S3 (vía backend) |
| Tests | Vitest (runner Angular) |

---

## Requisitos

- Node.js 20+
- npm 10+
- Backend corriendo en `http://localhost:8080` (ver [backend/README.md](../backend/README.md))

---

## Configuración

El frontend se comunica directamente con el backend local. Las URLs están configuradas en los servicios:

| Servicio | URL |
|---|---|
| GraphQL | `http://localhost:8080/graphql` |
| WebSocket | `ws://localhost:8080/ws` |
| Upload REST | `http://localhost:8080/api/uploads` |

Si el backend corre en otro host/puerto, editar los archivos en `src/app/app.config.ts` y `src/app/services/`.

---

## Instalación y ejecución

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo (http://localhost:4200)
npm start

# O equivalente con Angular CLI
npx ng serve
```

El navegador se recarga automáticamente al modificar archivos fuente.

---

## Builds

```bash
# Build de producción
npm run build

# Build en modo watch (recompila al cambiar archivos)
npm run watch
```

El output se escribe en `dist/frontend/`.

---

## Tests

```bash
# Ejecutar todos los tests (modo CI, sin watch)
npm test -- --watch=false

# Modo watch interactivo
npm test
```

El runner es **Vitest** (no Jasmine/Jest). Los mocks en los specs usan una función helper `createMockFunction<T>()` definida en cada spec, compatible con Vitest sin globals externos.

### Archivos de test existentes

| Archivo | Qué cubre |
|---|---|
| `src/app/app.spec.ts` | Componente raíz |
| `src/app/components/chat-area/chat-area.spec.ts` | Envío de mensajes, upload de imagen, error temporal |
| `src/app/components/sidebar/sidebar.spec.ts` | Renderizado de conversaciones |
| `src/app/components/settings-page/settings-page.spec.ts` | Avatar upload antes de guardar perfil |
| `src/app/services/upload.service.spec.ts` | HTTP multipart y header de autorización |
| `src/app/features/auth/config/login/login.spec.ts` | Formulario de login |
| `src/app/features/auth/config/register/register.spec.ts` | Formulario de registro |
| `src/app/components/chat-layout/chat-layout.spec.ts` | Layout del chat |

---

## Funcionalidades

### Autenticación
- Login y registro con usuario y contraseña
- Token JWT almacenado en `localStorage`
- Guard de ruta (`auth.guard.ts`) redirige a login si no hay sesión
- Logout automático si el servidor devuelve `401`

### Chat en tiempo real
- Lista de conversaciones en el sidebar, actualizada por WebSocket
- Área de chat con scroll infinito (carga páginas de 25 mensajes al hacer scroll arriba)
- Separadores de fecha entre mensajes (Hoy / Ayer / fecha completa)
- Indicador de escritura animado (`...`) cuando el otro usuario está escribiendo
- Confirmación de leído (doble tilde)
- Envío de mensajes de texto y/o imágenes
- Notificaciones de mensajes no leídos en el sidebar

### Imágenes en el chat
- Adjuntar imágenes (`jpg`, `png`, `webp`, `gif`)
- Preview local antes de enviar (sin base64 en DB — se usa `URL.createObjectURL`)
- Upload a S3 vía `POST /api/uploads` antes de enviar el mensaje GraphQL
- Banner de error temporal si falla el upload (no se envía el mensaje)
- Las imágenes recibidas se muestran como `<img>` en la burbuja de mensaje

### Amigos
- Buscar personas con paginación
- Agregar, aceptar, rechazar solicitudes de amistad
- Eliminar amigo
- Bloquear usuario (evita mensajes en ambas direcciones) con ícono 🚫
- Desbloquear usuario con ícono de candado

### Bloqueo
Cuando un usuario es bloqueado:
- El chat muestra un banner rojo y deshabilita el campo de mensaje
- El backend rechaza cualquier intento de `sendMessage` entre usuarios bloqueados

### Perfil y configuración
- Cambiar nombre completo
- Subir avatar desde archivo local (upload a S3, preview instantáneo)
- Cambiar contraseña

### Historias
- Vista de historias de los amigos
- Las historias expiran a las 24 horas

### Indicador de presencia
- Punto verde / gris en avatares según si el usuario está en línea

---

## Estructura de carpetas

```
src/app/
├── app.ts / app.config.ts / app.routes.ts   # Raíz, providers y rutas
├── graphql.provider.ts                       # Configuración Apollo
├── components/
│   ├── chat-area/      # Área principal de mensajes
│   ├── chat-layout/    # Layout que contiene sidebar + chat-area
│   ├── sidebar/        # Lista de conversaciones
│   ├── people-page/    # Búsqueda y gestión de amigos
│   ├── settings-page/  # Perfil y contraseña
│   ├── stories-page/   # Historias
│   └── new-chat-dialog/# Diálogo para iniciar conversación
├── core/
│   ├── guards/         # auth.guard
│   └── services/       # auth.service
├── features/auth/      # Login y registro
├── graphql/
│   ├── mutations/      # Mutaciones GraphQL
│   └── queries/        # Queries GraphQL
└── services/
    ├── chat.service.ts              # Operaciones GraphQL principales
    ├── upload.service.ts            # Upload de imágenes al backend REST
    ├── realtime.service.ts          # WebSocket STOMP
    └── message-notification.service.ts  # Notificaciones de mensajes no leídos
```

---

## Notas de desarrollo

- Los componentes son **standalone** (sin NgModules).
- `ChangeDetectionStrategy.Default` — se usa `cdr.detectChanges()` para actualizaciones manuales en callbacks asíncronos.
- Las URLs de los servicios están hardcodeadas a `localhost:8080`. Para producción, moverlas a `environment.ts`.
- El bundle actual supera el límite de 500 kB configurado por el CLI (advertencia de build, no error).
