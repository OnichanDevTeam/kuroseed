# KuroSeed

<p align="center">
  <img src="public/favicon.svg" width="80" alt="KuroSeed">
</p>

<p align="center">
  <strong>Descargador automatico de anime con motor de torrents integrado</strong><br>
  Sin nube. Sin cuentas. Todo se queda en tu maquina.
</p>

<p align="center">
  <a href="https://onilabs.site">Creado por onilabs.site</a> ·
  <a href="https://ko-fi.com/onilabs">Apoyanos en Ko-fi</a>
</p>

---

## Que es KuroSeed?

KuroSeed monitorea los feeds RSS de Nyaa.si y descarga automaticamente nuevos episodios de anime conforme se publican. Todo corre en tu maquina local — sin servidores en la nube, sin suscripciones, sin cuentas.

Busca un anime por nombre, seleccionalo, y KuroSeed se encarga del resto: verificar nuevos episodios, descargar torrents y organizar tus archivos.

## Inicio Rapido

```bash
git clone https://github.com/OnichanDevTeam/kuroseed.git
cd kuroseed
npm install
node index.js
```

Abre **http://localhost:3000** en tu navegador.

## Caracteristicas

- **Wizard paso a paso** — Busca anime desde MyAnimeList con portada, puntuacion e info de episodios
- **Motor de torrents integrado** — Descarga videos directamente, sin necesidad de cliente externo
- **Descarga automatica** — Verifica nuevos episodios en un intervalo configurable (30m a 6h)
- **Matching inteligente** — Maneja grupos fansub, preferencias de calidad, deteccion de temporada y deduplicacion de episodios
- **Carpetas organizadas** — Crea automaticamente la estructura `Serie / Temporada / episodios + .torrents/`
- **Progreso en tiempo real** — Velocidad de descarga, ETA y barras de progreso en la UI
- **Auto-completado** — Pausa el seguimiento cuando el anime termina de emitirse y todos los episodios estan descargados
- **Notificaciones del navegador** — Recibe alertas cuando se encuentran y descargan nuevos episodios
- **Vista grid y lista** — Cambia entre grid de portadas y lista detallada
- **Bilingue** — Interfaz en ingles y espanol
- **qBittorrent opcional** — Usa el motor integrado o conecta qBittorrent si prefieres

## Privacidad y Datos

> **KuroSeed no almacena nada en la nube.**

| Dato | Ubicacion |
|------|-----------|
| Lista de anime y ajustes | Base de datos SQLite local (`kuroseed.db`) |
| Archivos .torrent | Tu carpeta de descarga configurada |
| Videos descargados (media) | Tu carpeta de descarga configurada |
| Metadata de anime (portadas, puntuaciones) | Obtenida de Jikan API, almacenada en DB local |

Las unicas llamadas externas son:
- **Nyaa.si** — Consultas RSS para encontrar nuevos episodios
- **Jikan API** — Metadata de anime desde MyAnimeList (portadas, conteo de episodios, puntuaciones)

Sin telemetria. Sin analytics. Sin cuentas de usuario. Ningun dato sale de tu maquina.

## Documentacion

- **[Arquitectura](docs/ARCHITECTURE.md)** — Diseno del sistema, responsabilidades de modulos, diagramas de flujo
- **[Como Funciona](docs/HOW-IT-WORKS.md)** — Explicacion paso a paso del pipeline de descarga

## Requisitos del Sistema

- **Node.js** 18+
- **macOS / Windows / Linux**
- Conexion a internet para RSS de Nyaa.si y descarga de torrents

### Primera ejecucion en macOS
macOS pedira permiso para permitir conexiones de red entrantes a Node.js — dale **Allow**. Es necesario para que el motor de torrents reciba datos de los peers.

### Primera ejecucion en Windows
Windows Firewall mostrara un dialogo para permitir Node.js — marca **Redes privadas** y dale **Permitir acceso**.

## Configuracion

Todos los ajustes estan en la UI web en **Ajustes**:

| Ajuste | Descripcion |
|--------|-------------|
| Motor de Descarga | Integrado (WebTorrent) o qBittorrent |
| Carpeta de Descarga | Donde se guardan los videos y archivos .torrent |
| Intervalo de Verificacion | Cada cuanto buscar nuevos episodios |
| Idioma | Ingles o Espanol |

## Apoya el Proyecto

Si KuroSeed te es util, considera apoyar el desarrollo:

<a href="https://ko-fi.com/onilabs">
  <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Apoyar en Ko-fi">
</a>

Cada aporte nos ayuda a seguir construyendo herramientas libres y de codigo abierto.

## Licencia

MIT

---

<p align="center">
  Construido con cuidado por <a href="https://onilabs.site">onilabs.site</a>
</p>
