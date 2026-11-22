# Publier PTR AI (.exe Windows + .dmg macOS) sur GitHub — gratuit

Dépôt : **https://github.com/shopifymael2025-bit/ptr-ai** (doit être **public** pour que les mises à jour obligatoires fonctionnent).

GitHub construit **les deux installeurs tout seul** (robots dans `.github/workflows/`) dès que tu publies une release :

- `PTR-AI-Setup-<version>.exe` (Windows) + `latest.yml`
- `PTR-AI-<version>-arm64.dmg` (Mac Apple Silicon) et `PTR-AI-<version>-x64.dmg` (Mac Intel) + `latest-mac.yml`

## 1. Mettre le code sur GitHub (une seule fois)

À la racine du projet (le dossier qui contient `ptr/`, `docs/` et `.github/`) :

```bash
git init -b main
git add .
git commit -m "PTR AI"
git remote add origin https://github.com/shopifymael2025-bit/ptr-ai.git
git push -u origin main
```

(ou GitHub Desktop : File → Add Local Repository → Publish repository)

## 2. Publier une version

1. Dans `ptr/package.json`, augmente `"version"` (ex. `1.4.0` → `1.5.0`). C'est le seul endroit où le numéro est écrit.
2. `git add . && git commit -m "v1.5.0" && git push`
3. Sur GitHub : **Releases → Draft a new release** → *Choose a tag* : `v1.5.0` (exactement la version du `package.json`, avec un `v`) → **Create new tag** → **Publish release**.
4. Onglet **Actions** : « Release Windows » et « Release macOS » tournent (10–15 min). Quand ils sont verts ✓, la release contient les `.exe` et `.dmg`.

Si un robot est rouge ✗ : clique dessus pour lire l'erreur. Cas le plus courant : le tag ne correspond pas à la version du `package.json`. Relance via **Actions → (le robot) → Run workflow** en indiquant le tag.

## 3. Mises à jour obligatoires

L'adresse des mises à jour est écrite dans le code (`GITHUB_REPO` dans `ptr/src/shared/app.ts`). Quand une release avec un numéro plus élevé est publiée, PTR AI bloque l'écran jusqu'à l'installation (Windows : automatique ; Mac : page de téléchargement).

## 4. Site (GitHub Pages)

**Settings → Pages** → Source : *Deploy from a branch* → `main` → dossier `/docs`. Site : https://shopifymael2025-bit.github.io/ptr-ai/ — il lit tout seul la dernière release.

## 5. Mac : premier lancement

L'app n'est pas signée par Apple : clic droit sur PTR AI dans Applications → **Ouvrir** → **Ouvrir**. Si macOS dit « endommagée » :

```bash
xattr -dr com.apple.quarantine "/Applications/PTR AI.app"
```
