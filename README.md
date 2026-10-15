# Asesor de Seguros (Vercel)

Chat para consultar pólizas desde el navegador, sin cuenta de Claude. Tu equipo entra con una clave compartida; la API key de Claude queda guardada solo en el servidor.

## Qué hay en el proyecto

- `public/index.html`: la página (pantalla de clave, chat y adjuntos).
- `api/chat.js`: función que valida la clave del equipo y llama a la API de Claude.
- `lib/agent.js`: instrucciones del asesor y base de conocimiento general. Aquí se cambia lo que sabe y cómo responde.
- `vercel.json`, `package.json`: configuración.

## Lo que necesitas

1. **Una API key de Claude.** Se crea en la Claude Console (ver https://docs.claude.com). Es distinta de tu cuenta de Claude.ai y se paga por uso. En la Console conviene poner un límite de gasto mensual.
2. **Una cuenta de Vercel.**
3. **Una clave para tu equipo.** Invéntala tú (larga, difícil de adivinar) y compártela por un canal privado.

## Desplegar con la línea de comandos

Necesitas Node.js instalado. Desde la carpeta del proyecto:

```
npm i -g vercel
vercel login
vercel
```

Responde que sí a crear un proyecto nuevo y deja los valores por defecto. Luego guarda las dos variables (te pedirá el valor de cada una; elige Production):

```
vercel env add ANTHROPIC_API_KEY
vercel env add APP_PASSWORD
```

Después publica en producción:

```
vercel --prod
```

Vercel te da la dirección. Compártela con tu equipo junto con la clave.

## Desplegar desde GitHub

1. Sube esta carpeta a un repositorio privado. El `.gitignore` ya excluye los archivos con secretos.
2. En Vercel: Add New, Project, importa el repositorio y deja los valores por defecto.
3. Antes de desplegar, en Environment Variables agrega `ANTHROPIC_API_KEY` y `APP_PASSWORD`.

## Probar en tu computadora

Copia `.env.example` a `.env.local`, llena los dos valores y corre `vercel dev`.

## Cambiar lo que sabe el asesor

Edita `lib/agent.js`: las reglas están en `RULES` y la información general del equipo en `KNOWLEDGE`. Después vuelve a desplegar (`vercel --prod`, o un push a GitHub). Nadie del equipo puede modificarlo desde el chat.

## Cambiar la clave del equipo o la API key

Cambia la variable en Vercel (Settings, Environment Variables) y vuelve a desplegar. Las variables nuevas solo se aplican en despliegues nuevos. Al cambiar la clave, quienes tengan una sesión abierta deberán entrar de nuevo.

## Límites a tener en cuenta

- Vercel acepta hasta 4.5 MB por solicitud. Por eso los PDFs de hasta 2.8 MB se envían completos, incluidos los escaneados. Los más pesados se leen en el navegador y se envía solo el texto; si el PDF más pesado es un escaneo sin texto, la página pide comprimirlo o subir menos páginas. Las fotos se reducen automáticamente antes de enviarse.
- `vercel.json` pide hasta 60 segundos por respuesta. Si tu plan de Vercel no lo permite, baja `maxDuration`.
- La clave compartida no distingue entre personas. Si necesitas saber quién hizo cada consulta o dar de baja a una persona sin cambiar la clave para todos, hay que agregar usuarios individuales.
- Los documentos se envían a la API de Claude para responder. La página no los guarda; cada consulta nueva empieza de cero.
