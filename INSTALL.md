# MCP Chrome Screenshot

Extension Chrome pour captures d'écran rapides avec intégration Claude Code via MCP.

## Prerequisites

- Node.js 18+
- npm
- Chrome / Chromium

## Features

- **Capture viewport** : `Ctrl+Shift+S` pour capturer l'écran visible
- **Capture zone** : Sélection rectangle pour capturer une zone précise
- **Formats multiples** : PNG, JPEG, WebP, GIF
- **Mémorisation zone** : La dernière zone sélectionnée est mémorisée
- **Clipboard path** : Le chemin du fichier est copié automatiquement
- **Intégration Claude Code** : Claude peut déclencher des captures via MCP

## Installation

### Option 1 : Script automatique (recommandé)

```bash
./install.sh
```

Le script :
- Build l'extension Chrome et le serveur MCP
- Tue les processus orphelins sur le port 9876
- Configure Claude Code pour ce projet

### Option 2 : Installation manuelle

#### 1. Extension Chrome

```bash
npm install && npm run build
```

Dans Chrome :
1. Ouvrir `chrome://extensions`
2. Activer "Mode développeur"
3. Cliquer "Charger l'extension non empaquetée"
4. Sélectionner le dossier `dist/`

#### 2. Serveur MCP

```bash
cd mcp-server && npm install && npm run build
```

#### 3. Configuration Claude Code

**Option A : Installation globale npm (recommandé)**

```bash
cd mcp-server && npm install -g .
quick-screenshot-mcp --install
```

**Option B : Configuration manuelle**

Ajouter à `~/.claude/settings.json` :

```json
{
  "mcpServers": {
    "quick-screenshot": {
      "command": "quick-screenshot-mcp",
      "args": []
    }
  }
}
```

### Étapes manuelles (toujours requises)

1. **Charger l'extension** dans Chrome (voir ci-dessus)
2. **Activer MCP Mode** : cliquer sur l'icône Quick Screenshot → activer "MCP Mode"
3. **Relancer Claude Code** dans ce projet

### Vérification

Dans Claude Code :
```
mcp__quick-screenshot__status
```

Doit retourner "Quick Screenshot extension is connected and ready."

### Troubleshooting

**Port 9876 déjà utilisé :**
```bash
# Trouver et tuer le processus
ss -tlnp | grep 9876
kill <PID>
```

**Extension non connectée :**
- Vérifier que "MCP Mode" est activé dans l'extension
- Vérifier que le serveur MCP tourne (relancer Claude Code)

## Usage

### Manuel (raccourcis clavier)

| Raccourci | Action |
|-----------|--------|
| `Ctrl+Shift+S` | Ouvrir preview / Capturer |
| `Enter` | Confirmer capture |
| `Escape` | Annuler |
| `←` / `→` | Changer de mode (visible/area) |
| `F` | Cycler les formats |

### Via Claude Code (MCP)

Claude Code a accès aux tools suivants :

```
mcp__quick-screenshot__capture
```
Capture un screenshot avec options :
- `mode` : "visible" (viewport) ou "area" (zone)
- `format` : "png", "jpeg", "webp", "gif"
- `area` : `{x, y, width, height}` pour mode area
- `quality` : 1-100 pour JPEG/WebP

```
mcp__quick-screenshot__status
```
Vérifie si l'extension Chrome est connectée.

## Architecture

```
┌─────────────┐     stdio      ┌─────────────┐   WebSocket   ┌─────────────┐
│ Claude Code │ ◄────────────► │  MCP Server │ ◄───────────► │  Extension  │
└─────────────┘                │  (Node.js)  │    :9876      │   Chrome    │
                               └─────────────┘               └─────────────┘
```

- **Extension Chrome** : Capture les screenshots, se connecte au serveur MCP via WebSocket
- **Serveur MCP** : Bridge stdio/WebSocket, expose les tools à Claude Code
- **Claude Code** : Utilise les tools MCP pour déclencher des captures

## Développement

```bash
# Build tout
npm run build                    # Extension
cd mcp-server && npm run build   # Serveur MCP

# Watch mode
npm run dev                      # Extension
cd mcp-server && npm run dev     # Serveur MCP
```

## Limitations

- L'extension doit être ouverte dans Chrome pour que Claude puisse capturer
- Le serveur MCP utilise le port 9876 (configurable)
- Capture limitée à l'onglet actif

## License

MIT
