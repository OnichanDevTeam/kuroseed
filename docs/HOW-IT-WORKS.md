# Como Funciona KuroSeed

[Volver al README](../README.md)

## Resumen

KuroSeed automatiza el pipeline completo de descarga de anime: **descubrir → filtrar → descargar → organizar**. Todo corre localmente en tu maquina.

## Pipeline de Descarga

```
El usuario agrega anime via Wizard
         │
         ▼
┌─────────────────────┐
│  1. BUSCAR           │  Jikan API (MyAnimeList)
│  El usuario busca    │  Retorna: titulo, portada,
│  por nombre y        │  puntuacion, episodios,
│  selecciona          │  estado de emision
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  2. CONFIGURAR       │  El usuario elige:
│  Grupo fansub        │  - Erai-raws / SubsPlease / etc.
│  Calidad (1080p)     │  - Carpeta de descarga
│  Ultimo episodio     │  - Temporada auto-detectada
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  3. GUARDAR EN DB    │  SQLite almacena:
│  Registro del anime  │  - Metadata de MAL (portada, score)
│  con toda la config  │  - Query de busqueda = titulo MAL
│  Estado: activo      │  - Preferencias de fansub, calidad
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  4. CRON CHECK       │  Se ejecuta cada 30m/1h/2h/6h
│  Para cada anime     │
│  activo:             │
└────────┬────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  5. CONSULTA RSS A NYAA                  │
│                                          │
│  Construye URL como:                     │
│  nyaa.si/?page=rss                       │
│    &q=%5BErai-raws%5D+Jujutsu+Kaisen    │
│       +2nd+Season+1080p                  │
│    &c=1_2&f=0                            │
│                                          │
│  La query de busqueda ES el titulo MAL   │
│  Los brackets del fansub se URL-encodean │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  6. FILTRADO DE EPISODIOS (matcher.js)   │
│                                          │
│  Filtra resultados RSS a traves de:      │
│  ┌─────────────────────────────────┐     │
│  │ ✓ Grupo fansub coincide?        │     │
│  │ ✓ Calidad coincide? (1080p)     │     │
│  │ ✓ Temporada OK? (rechaza solo   │     │
│  │   numeros de temporada          │     │
│  │   explicitamente diferentes)    │     │
│  │ ✓ Query coincide con titulo?    │     │
│  │   (todas las palabras deben     │     │
│  │   aparecer en el nombre, no     │     │
│  │   en el numero de episodio)     │     │
│  │ ✓ Episodio > ultimo descargado? │     │
│  │ ✓ No esta ya en la DB?         │     │
│  │ ✓ Mejor seeders por episodio   │     │
│  └─────────────────────────────────┘     │
│                                          │
│  Patrones de deteccion de episodio:      │
│  "- 09", "- 09v2", "E09", "EP09",       │
│  "S01E09", " 09 "                        │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  7. DESCARGAR ARCHIVO .TORRENT           │
│                                          │
│  Descarga desde Nyaa:                    │
│  nyaa.si/download/XXXXX.torrent          │
│                                          │
│  Guarda en carpeta organizada:           │
│  /Anime/Jujutsu Kaisen/2nd Season/       │
│    .torrents/JJK_S2_E03_Erai-raws.torrent│
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  8. INICIAR DESCARGA DE VIDEO            │
│                                          │
│  Motor integrado (WebTorrent):           │
│  Lee .torrent → conecta a peers         │
│  → descarga .mkv a:                      │
│  /Anime/Jujutsu Kaisen/2nd Season/       │
│                                          │
│  O qBittorrent (si esta configurado):    │
│  Envia .torrent via Web API              │
│  → qBittorrent maneja la descarga       │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  9. REGISTRAR Y ACTUALIZAR               │
│                                          │
│  - Agregar episodio a la DB              │
│  - Actualizar ultimo episodio descargado │
│  - Registrar exito/fallo                 │
│  - Si termino de emitirse + todos los    │
│    episodios descargados: auto-pausar    │
│  - Enviar notificacion al navegador      │
└─────────────────────────────────────────┘
```

## Organizacion de Carpetas

Cuando seleccionas una carpeta de descarga (ej. `/Peliculas/anime`), KuroSeed crea automaticamente esta estructura:

```
/Peliculas/anime/
├── Jujutsu Kaisen/
│   ├── 2nd Season/
│   │   ├── [Erai-raws] Jujutsu Kaisen 2nd Season - 01.mkv
│   │   ├── [Erai-raws] Jujutsu Kaisen 2nd Season - 02.mkv
│   │   └── .torrents/
│   │       ├── Jujutsu_Kaisen_2nd_Season_S2_E01_Erai-raws.torrent
│   │       └── Jujutsu_Kaisen_2nd_Season_S2_E02_Erai-raws.torrent
│   └── Shimetsu Kaiyuu - Zenpen/
│       ├── [Erai-raws] Jujutsu Kaisen Shimetsu Kaiyuu...01.mkv
│       └── .torrents/
│           └── ...torrent
├── My Hero Academia/
│   └── Season 7/
│       ├── ...mkv
│       └── .torrents/
└── One Piece/
    └── Season 1/
        └── ...
```

**Deteccion inteligente de carpetas:** Si seleccionas `/Peliculas/anime/Jujutsu Kaisen` como carpeta (ya tiene el nombre de la serie), KuroSeed no creara un duplicado `Jujutsu Kaisen/Jujutsu Kaisen/` — detecta la superposicion.

## Deteccion de Temporada

Las temporadas se auto-detectan del titulo del anime seleccionado en MAL:

| Titulo en MAL | Temporada Detectada |
|---------------|---------------------|
| Jujutsu Kaisen | 1 |
| Jujutsu Kaisen 2nd Season | 2 |
| My Hero Academia Season 7 | 7 |
| Mob Psycho 100 III | 3 |
| Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen | 1 (nombre de arco, sin numero) |

El numero de temporada se usa para nombrar carpetas y archivos `.torrent`, pero el filtrado real se hace comparando el titulo completo de MAL contra los titulos de torrents en Nyaa.

## Proteccion Cruzada entre Temporadas

Un problema comun: buscar "Anime 2" en Nyaa tambien retorna "Anime - 02" (episodio 2 de la temporada 1). KuroSeed previene esto verificando que **todas las palabras de la query aparezcan en la porcion del titulo** (antes del numero de episodio), no en el numero de episodio.

```
Query de busqueda: "...Ken 2"
✓ PASA:    "...Ken 2 - 01 [1080p]"     → "Ken 2" encontrado en el titulo
✗ RECHAZA: "...Ken - 02 [1080p]"       → "2" solo en el numero de episodio
```

## Almacenamiento de Datos

Todo se almacena en una base de datos SQLite local (`kuroseed.db`):

| Tabla | Proposito |
|-------|-----------|
| `animes` | Entradas del watchlist con config (fansub, calidad, carpeta, metadata MAL) |
| `episodes` | Registros de episodios descargados (previene re-descargas) |
| `downloads` | Log de cada intento de descarga (exito/fallo) |
| `settings` | Configuracion de la app (motor, carpetas, intervalo cron, idioma) |

---

[Volver al README](../README.md) · [Arquitectura](ARCHITECTURE.md)
