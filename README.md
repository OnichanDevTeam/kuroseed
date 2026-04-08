<p align="center">
  <img src="public/favicon.svg" width="120" alt="KuroSeed">
</p>

<h1 align="center">KuroSeed</h1>

<p align="center">
  <strong>Descargador automatico de anime con motor de torrents integrado</strong><br>
  Sin nube. Sin cuentas. Todo se queda en tu maquina.
</p>

<p align="center">
  <a href="https://github.com/OnichanDevTeam/kuroseed/stargazers">
    <img src="https://img.shields.io/github/stars/OnichanDevTeam/kuroseed?style=for-the-badge&logo=github&color=6c5ce7&labelColor=0f0f13&cacheSeconds=3600" alt="Stars">
  </a>
  <a href="https://github.com/OnichanDevTeam/kuroseed/releases/latest">
    <img src="https://img.shields.io/github/v/release/OnichanDevTeam/kuroseed?style=for-the-badge&color=a29bfe&labelColor=0f0f13&cacheSeconds=3600" alt="Release">
  </a>
  <a href="https://github.com/OnichanDevTeam/kuroseed/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/OnichanDevTeam/kuroseed?style=for-the-badge&color=00b894&labelColor=0f0f13&cacheSeconds=3600" alt="License">
  </a>
</p>

---

## Descargar

<table>
  <tr>
    <td align="center" width="50%">
      <h3>Windows</h3>
      <p>Portable — un solo <code>.exe</code>, sin instalacion</p>
      <a href="https://github.com/OnichanDevTeam/kuroseed/releases/latest/download/KuroSeed.1.0.3.exe">
        <img src="https://img.shields.io/badge/Descargar_Windows-6c5ce7?style=for-the-badge&logo=windows&logoColor=white" alt="Descargar Windows">
      </a>
    </td>
    <td align="center" width="50%">
      <h3>macOS</h3>
      <p>DMG — arrastra a Aplicaciones</p>
      <a href="https://github.com/OnichanDevTeam/kuroseed/releases/latest/download/KuroSeed-1.0.3-arm64.dmg">
        <img src="https://img.shields.io/badge/Descargar_macOS-a29bfe?style=for-the-badge&logo=apple&logoColor=white" alt="Descargar macOS">
      </a>
    </td>
  </tr>
</table>

> Tambien puedes ver todas las versiones en [**Releases**](https://github.com/OnichanDevTeam/kuroseed/releases).

---

## Que es KuroSeed?

KuroSeed monitorea los feeds RSS de Nyaa.si y descarga automaticamente nuevos episodios de anime conforme se publican. Todo corre en tu maquina local — sin servidores en la nube, sin suscripciones, sin cuentas.

Busca un anime por nombre, seleccionalo, y KuroSeed se encarga del resto: verificar nuevos episodios, descargar torrents y organizar tus archivos.

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

## Inicio Rapido (modo desarrollo)

```bash
git clone https://github.com/OnichanDevTeam/kuroseed.git
cd kuroseed
npm install
node index.js
```

Abre **http://localhost:3000** en tu navegador.

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

## Primera ejecucion

### Windows
Windows Firewall mostrara un dialogo para permitir la app — marca **Redes privadas** y dale **Permitir acceso**.

### macOS
Si macOS muestra **"KuroSeed is damaged and can't be opened"**, abre Terminal y ejecuta:
```bash
xattr -cr /Applications/KuroSeed.app
```
Esto es necesario porque la app no esta firmada con Apple Developer certificate. Luego abrela normalmente.

macOS tambien pedira permiso para permitir conexiones de red entrantes — dale **Allow**. Es necesario para que el motor de torrents reciba datos de los peers.

## Configuracion

Todos los ajustes estan en la UI en **Ajustes**:

| Ajuste | Descripcion |
|--------|-------------|
| Motor de Descarga | Integrado (WebTorrent) o qBittorrent |
| Carpeta de Descarga | Donde se guardan los videos y archivos .torrent |
| Intervalo de Verificacion | Cada cuanto buscar nuevos episodios |
| Idioma | Ingles o Espanol |

---

## Dale una estrella

Si KuroSeed te es util, regalanos una estrella — nos ayuda a crecer y motiva el desarrollo.

<p align="center">
  <a href="https://github.com/OnichanDevTeam/kuroseed/stargazers">
    <img src="https://img.shields.io/badge/Dale_una_%E2%AD%90_en_GitHub-6c5ce7?style=for-the-badge&logo=github&logoColor=white" alt="Star en GitHub">
  </a>
  <a href="https://ko-fi.com/onilabs">
    <img src="https://img.shields.io/badge/Apoyar_en_Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Ko-fi">
  </a>
</p>

## Licencia

MIT

---

<p align="center">
  Construido con cuidado por <a href="https://onilabs.site">onilabs.site</a>
</p>
