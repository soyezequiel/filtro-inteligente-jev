# Marcador de slop

Extensión de Chrome (Manifest V3) que marca posts cuando coinciden con un criterio editable. Por defecto marca contenido que considerás *slop*. Si más adelante querés buscar otro tipo de post, cambiá el criterio y el texto de la etiqueta.

## Instalación

1. Abrí `chrome://extensions` y activá **Modo desarrollador**.
2. Hacé clic en **Cargar extensión sin empaquetar** y elegí esta carpeta.
3. Abrí el icono de la extensión.
4. Pegá tu clave de la [consola de TypeSafe](https://console.typesafe.ai/) para usar Jev.
5. Guardá la configuración.
6. Abrí X, Reddit, LinkedIn, Bluesky, Threads, Facebook o Instagram. Los posts que cumplan el criterio van a quedar borroneados y llevarán la etiqueta. Usá **Mostrar post** para ver uno y **Volver a ocultar** para borronearlo otra vez. Podés desactivar **Borronear los posts marcados** en el panel para dejar solo la etiqueta.

Podés pegar un texto en **Probar con un post** para verificar la configuración antes de navegar. Si cambiás el criterio, la etiqueta o el umbral, guardá los cambios; los posts visibles se vuelven a evaluar.

## Modelo y costo

La extensión usa Jev mediante la [API oficial de TypeSafe](https://docs.typesafe.ai/introduction/quickstart). TypeSafe consume los créditos disponibles en esa cuenta.

## Alcance y datos

- Analiza el texto de los posts que entran en pantalla. En Instagram usa la descripción visible; en Facebook, el texto del post. No analiza imágenes, videos, historias, reels sin descripción ni el contenido de enlaces.
- Envía ese texto y tu criterio a la API de Jev. Cada post nuevo puede generar una consulta. Mantiene una caché temporal de resultados para evitar consultas repetidas durante la misma sesión del service worker.
- Las credenciales y ajustes se guardan en `chrome.storage.local` en tu navegador; las claves no se insertan en las páginas ni se sincronizan. El service worker limita el acceso al almacenamiento a contextos de la extensión.
- Los sitios cambian su HTML con frecuencia. Si uno deja de mostrar etiquetas, puede requerir actualizar su selector en `content.js`.
- Si la API falla, la extensión no marca ese post. Abrí el panel y usá **Probar con un post** para ver el error.
- Si TypeSafe responde `401`, su [referencia de API](https://docs.typesafe.ai/api) lo define como clave ausente o inválida. Pegá la clave de la consola de TypeSafe y probá de nuevo; si persiste, generá otra clave. El panel acepta tanto el valor solo como `TYPESAFE_API_KEY=valor`.

## Desarrollo

No hay dependencias ni compilación. Verificación de lógica: `node --test`.

Modelo utilizado: [Jev mediante TypeSafe](https://docs.typesafe.ai/api). Devuelve una estimación de coincidencia que la extensión compara con el umbral elegido.
