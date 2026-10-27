# Política de seguridad

## Versiones soportadas

Solo la rama `main` recibe correcciones de seguridad: es la que está desplegada (el sitio [bioluma-xi.vercel.app](https://bioluma-xi.vercel.app) y las funciones del ranking en Vercel). Las demás ramas, los commits anteriores y las versiones descargadas no tienen soporte.

| Versión | Soporte |
| --- | --- |
| `main` (desplegada) | Sí |
| Otras ramas, commits y versiones anteriores | No |

## Cómo reportar una vulnerabilidad

Escribe en privado a **ronalddemiancipagauta@gmail.com** con el asunto `[Seguridad] Lenia: <resumen breve>`.

**No abras issues, discusiones ni pull requests públicos para reportar una vulnerabilidad**: la dejarían a la vista antes de que exista una corrección.

Incluye en el reporte:

- Qué parte está afectada: URL, ruta de la API (`/api/...`), archivo o commit.
- Tipo de problema e impacto posible (por ejemplo, saltarse la validación del ranking del servidor o falsificar compras).
- Pasos para reproducirlo o una prueba de concepto mínima.
- La versión del juego o el commit de `main` que probaste, y el navegador o plataforma.

Prueba solo con tu propia partida y datos de prueba, y no degrades el servicio. Hacer trampa en tu partida local no cuenta como vulnerabilidad: el juego corre en tu navegador.

## Plazos orientativos

- **Acuse de recibo:** dentro de 72 horas.
- **Evaluación inicial** (si se confirma y qué gravedad tiene): dentro de 7 días.

Luego recibirás el plan de corrección y un aviso cuando esté desplegada. Te pido no divulgar el problema hasta entonces.

## Medidas actuales

CI con permisos de solo lectura y sin secretos; el ranking valida en el servidor cada envío y limita las peticiones, y el webhook de la tienda rechaza todo pedido sin una firma válida.

---

## Summary (English)

Only the `main` branch (the deployed one) receives security fixes. Report vulnerabilities privately to **ronalddemiancipagauta@gmail.com**. Please do not open public issues, discussions or pull requests for them. Include the affected component, the impact, steps to reproduce or a minimal proof of concept, and the game version or commit you tested. Cheating in your own local save is not a vulnerability, since the game runs in your browser. You can expect an acknowledgement within 72 hours and an initial assessment within 7 days.
