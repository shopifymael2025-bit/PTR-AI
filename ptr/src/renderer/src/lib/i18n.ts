import { useStore } from './store'

// Short keys used across the UI.
const en: Record<string, string> = {
  tagline: 'Your code. Your intelligence.',
  newChat: 'New chat', openProject: 'Open project', newWorkspace: 'New workspace', recentProjects: 'Recent projects', history: 'History',
  settings: 'Settings', search: 'Search', noProject: 'No project', noConversations: 'No conversations yet',
  rename: 'Rename', delete: 'Delete', pin: 'Pin', unpin: 'Unpin', remove: 'Remove from list',
  chat: 'Chat', code: 'Code', workspace: 'Workspace',
  composerPlaceholder: 'Ask anything, / for commands, @ to attach…',
  ask: 'Ask', build: 'Build', plan: 'Plan',
  askDesc: 'Read-only: explain and analyze', buildDesc: 'Edit files and run commands', planDesc: 'Propose a plan to approve first',
  send: 'Send', stop: 'Stop', regenerate: 'Regenerate', edit: 'Edit', copy: 'Copy', copied: 'Copied', retry: 'Retry', applyToFile: 'Apply to file',
  selectModel: 'Select a model', noModels: 'No models available', local: 'Local', cloud: 'Cloud', free: 'Free', tools: 'Tools', noTools: 'Chat only',
  allow: 'Allow', deny: 'Deny', alwaysAllow: 'Always allow', approve: 'Approve plan', approvalNeeded: 'Approval needed',
  changes: 'Changes', revert: 'Revert', reapply: 'Re-apply', openInEditor: 'Open in editor', noChanges: 'No changes in this session',
  explorer: 'Explorer', terminal: 'Terminal', git: 'Source control', newTerminal: 'New terminal',
  emptyTitle: 'What should we build?', emptyHint: 'Open a project so PTR AI can read and edit files, or just chat.',
  interrupted: 'This session was interrupted when PTR AI closed.', continue: 'Continue',
  save: 'Save', cancel: 'Cancel', close: 'Close', back: 'Back', next: 'Next', skip: 'Skip', finish: 'Enter PTR AI',
  welcome: 'Welcome to PTR AI', chooseProvider: 'Choose your AI provider', connectModel: 'Connect your model', openOrStart: 'Open a project or start a new workspace',
  general: 'General', models: 'Models', agent: 'Agent', editor: 'Editor', privacy: 'Privacy', about: 'About',
  language: 'Language', theme: 'Theme', dark: 'Dark', light: 'Light', system: 'System',
  thinking: 'Thinking', working: 'Working…', stopped: 'Stopped', error: 'Error'
}
const fr: Record<string, string> = {
  tagline: 'Votre code. Votre intelligence.',
  newChat: 'Nouvelle discussion', openProject: 'Ouvrir un projet', newWorkspace: 'Nouvel espace', recentProjects: 'Projets récents', history: 'Historique',
  settings: 'Paramètres', search: 'Rechercher', noProject: 'Aucun projet', noConversations: 'Aucune discussion',
  rename: 'Renommer', delete: 'Supprimer', pin: 'Épingler', unpin: 'Désépingler', remove: 'Retirer de la liste',
  chat: 'Chat', code: 'Code', workspace: 'Espace',
  composerPlaceholder: 'Demandez n’importe quoi, / pour les commandes, @ pour joindre…',
  ask: 'Question', build: 'Construire', plan: 'Plan',
  askDesc: 'Lecture seule : expliquer et analyser', buildDesc: 'Modifier les fichiers et lancer des commandes', planDesc: 'Proposer un plan à approuver',
  send: 'Envoyer', stop: 'Arrêter', regenerate: 'Régénérer', edit: 'Modifier', copy: 'Copier', copied: 'Copié', retry: 'Réessayer', applyToFile: 'Appliquer au fichier',
  selectModel: 'Choisir un modèle', noModels: 'Aucun modèle disponible', local: 'Local', cloud: 'Cloud', free: 'Gratuit', tools: 'Outils', noTools: 'Chat seul',
  allow: 'Autoriser', deny: 'Refuser', alwaysAllow: 'Toujours autoriser', approve: 'Approuver le plan', approvalNeeded: 'Approbation requise',
  changes: 'Modifications', revert: 'Annuler', reapply: 'Réappliquer', openInEditor: 'Ouvrir dans l’éditeur', noChanges: 'Aucune modification dans cette session',
  explorer: 'Explorateur', terminal: 'Terminal', git: 'Contrôle de source', newTerminal: 'Nouveau terminal',
  emptyTitle: 'Que construisons-nous ?', emptyHint: 'Ouvrez un projet pour que PTR AI lise et modifie les fichiers, ou discutez simplement.',
  interrupted: 'Cette session a été interrompue à la fermeture de PTR AI.', continue: 'Continuer',
  save: 'Enregistrer', cancel: 'Annuler', close: 'Fermer', back: 'Retour', next: 'Suivant', skip: 'Passer', finish: 'Entrer dans PTR AI',
  welcome: 'Bienvenue dans PTR AI', chooseProvider: 'Choisissez votre fournisseur d’IA', connectModel: 'Connectez votre modèle', openOrStart: 'Ouvrez un projet ou créez un espace',
  general: 'Général', models: 'Modèles', agent: 'Agent', editor: 'Éditeur', privacy: 'Confidentialité', about: 'À propos',
  language: 'Langue', theme: 'Thème', dark: 'Sombre', light: 'Clair', system: 'Système',
  thinking: 'Réflexion', working: 'En cours…', stopped: 'Arrêté', error: 'Erreur'
}

// Full English sentences used directly as keys (French translations).
const FR_TEXT: Record<string, string> = {
  // settings — general
  'On startup': 'Au démarrage', 'What PTR AI opens when it launches': 'Ce que PTR AI ouvre au lancement', 'Last project': 'Dernier projet', 'Home': 'Accueil',
  'Notifications': 'Notifications', 'Desktop notification when a task finishes or needs approval while PTR AI is in the background': 'Notification quand une tâche se termine ou demande une approbation alors que PTR AI est en arrière-plan',
  'Reduce motion': 'Réduire les animations', 'Disable interface animations': 'Désactiver les animations de l’interface', 'Run onboarding again': 'Relancer l’accueil', 'Open': 'Ouvrir',
  'Shortcuts': 'Raccourcis', 'Press keys…': 'Appuyez sur les touches…',
  'Enter sends, Shift+Enter inserts a new line in the composer. Ctrl+S saves in the editor.': 'Entrée envoie, Maj+Entrée ajoute une ligne. Ctrl+S enregistre dans l’éditeur.',
  'Focus Chat': 'Aller au chat', 'Open Project': 'Ouvrir un projet', 'New Session': 'Nouvelle session', 'Quick Open': 'Ouverture rapide', 'Command Palette': 'Palette de commandes', 'Toggle Sidebar': 'Afficher/masquer la barre latérale',
  // settings — agent
  'Permissions': 'Autorisations', 'What PTR AI may do without asking you': 'Ce que PTR AI peut faire sans vous demander',
  'Auto': 'Auto', 'All': 'Tout', 'Approval': 'Approbation',
  'Auto — PTR AI edits files and runs commands on its own, but asks before dangerous actions (deleting files, recursive deletes, git push, registry, shutdown…). Every edit stays reviewable and revertible in Changes.': 'Auto — PTR AI modifie les fichiers et lance les commandes seul, mais demande avant les actions dangereuses (suppression de fichiers, suppressions récursives, git push, registre, arrêt…). Chaque modification reste consultable et annulable dans Modifications.',
  'All — PTR AI does everything without asking, including risky commands. Access stays limited to the project folder. Use only on projects you can afford to lose or have backed up.': 'Tout — PTR AI fait tout sans demander, y compris les commandes risquées. L’accès reste limité au dossier du projet. À n’utiliser que sur des projets sauvegardés.',
  'Approval — PTR AI asks before every edit, move, delete and command.': 'Approbation — PTR AI demande avant chaque modification, déplacement, suppression et commande.',
  'Allow ALL actions without asking, including dangerous commands?': 'Autoriser TOUTES les actions sans demander, y compris les commandes dangereuses ?',
  'Default agent mode': 'Mode d’agent par défaut', 'Maximum steps per task': 'Nombre maximal d’étapes par tâche', 'Stops runaway loops': 'Évite les boucles sans fin',
  'Command timeout (seconds)': 'Délai max. d’une commande (secondes)', 'Context budget (tokens)': 'Budget de contexte (tokens)',
  'Older messages are trimmed and summarized beyond this. Keep it below your model\'s context window.': 'Au-delà, les anciens messages sont raccourcis et résumés. Restez sous la fenêtre de contexte du modèle.',
  // settings — editor / terminal
  'Font family': 'Police', 'Font size': 'Taille de police', 'Tab size': 'Taille des tabulations', 'Word wrap': 'Retour à la ligne', 'Minimap': 'Minimap',
  'Auto save': 'Enregistrement auto', 'Save one second after you stop typing': 'Enregistre une seconde après la dernière frappe',
  'Default shell': 'Shell par défaut', 'Applies to new terminals': 'S’applique aux nouveaux terminaux', 'Cursor style': 'Style du curseur', 'Bar': 'Barre', 'Block': 'Bloc', 'Underline': 'Souligné',
  'Terminal backend failed to load:': 'Le terminal n’a pas pu se charger :',
  // settings — privacy
  'Local data': 'Données locales', 'Conversations, projects and settings are stored only on this computer.': 'Les discussions, projets et paramètres sont stockés uniquement sur cet ordinateur.',
  'Open folder': 'Ouvrir le dossier', 'Credential storage': 'Stockage des clés',
  'API keys are encrypted with Windows DPAPI via Electron safeStorage.': 'Les clés API sont chiffrées avec Windows DPAPI (Electron safeStorage).',
  'OS encryption is unavailable — keys are stored unencrypted in the data folder.': 'Chiffrement indisponible — les clés sont stockées en clair dans le dossier de données.',
  'Encrypted': 'Chiffré', 'Not encrypted': 'Non chiffré', 'Export conversations': 'Exporter les discussions', 'Save all conversations as JSON': 'Enregistrer toutes les discussions en JSON', 'Export…': 'Exporter…',
  'Clear history': 'Effacer l’historique', 'Deletes every conversation and change record. Files in your projects are not touched.': 'Supprime toutes les discussions et l’historique des modifications. Les fichiers de vos projets ne sont pas touchés.', 'Clear…': 'Effacer…',
  'Delete ALL conversation history? This cannot be undone.': 'Supprimer TOUT l’historique ? Action irréversible.', 'History cleared': 'Historique effacé', 'Exported to': 'Exporté vers',
  'With Ollama, inference stays on this machine. With cloud providers, your messages and any file contents or command output the agent reads are sent to that provider. Likely secrets (API keys, tokens) are redacted from tool output before it is sent.': 'Avec Ollama, tout reste sur cette machine. Avec un fournisseur cloud, vos messages et les fichiers ou sorties de commandes lus par l’agent lui sont envoyés. Les secrets probables (clés API, jetons) sont masqués avant l’envoi.',
  // settings — about
  'Version': 'Version', 'Runtime': 'Environnement', 'License': 'Licence', 'Diagnostics': 'Diagnostic', 'Run': 'Lancer',
  'The conversation database was unreadable at startup and was moved to': 'La base de discussions était illisible au démarrage et a été déplacée vers',
  'A new database was created.': 'Une nouvelle base a été créée.',
  // updates
  'Automatic updates': 'Mises à jour automatiques', 'Checks at launch and every 6 hours, downloads in the background, installs when you restart.': 'Vérifie au lancement puis toutes les 6 heures, télécharge en arrière-plan, installe au redémarrage.',
  'Check now': 'Vérifier', 'Checking for updates…': 'Recherche de mises à jour…', 'PTR AI is up to date.': 'PTR AI est à jour.', 'Downloading version': 'Téléchargement de la version',
  'is ready to install.': 'est prête à être installée.',  'Update failed:': 'Échec de la mise à jour :',
  'Not checked yet.': 'Pas encore vérifié.', 'Restart to update': 'Redémarrer pour mettre à jour', 'is ready.': 'est prête.', 'Later': 'Plus tard',
  'Updates only work in the installed app (not in development mode).': 'Les mises à jour ne fonctionnent que dans l’application installée.',
  'The URL is a folder holding latest.yml and the installer created by npm run dist. A free GitHub Releases page works: upload those files to a release and use …/releases/latest/download. Downloads are verified against the SHA-512 in latest.yml.': 'L’URL est un dossier contenant latest.yml et l’installeur créés par npm run dist. Une page GitHub Releases gratuite convient : envoyez ces fichiers dans une release et utilisez …/releases/latest/download. Les téléchargements sont vérifiés (SHA-512).',
  // models
  'Ollama · local, free, private': 'Ollama · local, gratuit, privé', 'Running': 'En marche', 'Not running at the configured address': 'Ne répond pas à l’adresse configurée',
  'Ollama runs open models on your own computer at no cost. To use it:': 'Ollama fait tourner des modèles ouverts sur votre ordinateur, gratuitement. Pour l’utiliser :',
  'Download and install Ollama for Windows from the official site.': 'Téléchargez et installez Ollama pour Windows depuis le site officiel.',
  'Start Ollama (it runs in the tray and listens on http://localhost:11434).': 'Lancez Ollama (il tourne dans la barre des tâches sur http://localhost:11434).',
  'Come back here and press recheck, then download a model below.': 'Revenez ici, cliquez sur revérifier, puis téléchargez un modèle ci-dessous.',
  'PTR AI never installs software without you. Larger models need more RAM/VRAM; 7–8B models generally want ~8 GB of free memory.': 'PTR AI n’installe jamais rien sans vous. Les gros modèles demandent plus de RAM/VRAM ; les modèles 7–8B veulent environ 8 Go libres.',
  'Download a model': 'Télécharger un modèle', 'Pull': 'Télécharger', 'Installed': 'Installés', 'Use': 'Utiliser', 'No models installed yet.': 'Aucun modèle installé.',
  'Browse the full library at ollama.com/library. Pick models tagged “tools” for full agent mode.': 'Bibliothèque complète sur ollama.com/library. Choisissez des modèles « tools » pour le mode agent complet.',
  'tool calling': 'appels d’outils', 'chat only (no tools)': 'chat seul (sans outils)', 'tool support unknown': 'outils : inconnu',
  'Providers': 'Fournisseurs', 'Add provider': 'Ajouter un fournisseur', 'Enabled': 'Activé', 'Base URL': 'URL de base', 'API key': 'Clé API', 'Tool calling': 'Appels d’outils',
  'Paste your key': 'Collez votre clé', '•••••••• (stored encrypted)': '•••••••• (stockée chiffrée)', 'Clear': 'Effacer', 'Test connection': 'Tester la connexion', 'Connected': 'Connecté',
  'Auto-detect (use provider metadata, fall back if rejected)': 'Détection auto (infos du fournisseur, repli si refusé)', 'All models support tools': 'Tous les modèles gèrent les outils', 'No tool calling (chat only)': 'Pas d’outils (chat seul)',
  'Our own AI model, in beta. May make mistakes.': 'Notre propre modèle d’IA, en bêta. Peut se tromper.',
  'Get a key': 'Obtenir une clé', 'Prompts and file contents the agent reads are sent to this endpoint. It may charge for usage.': 'Les messages et fichiers lus par l’agent sont envoyés à ce service. Il peut être payant.',
  'LM Studio, llama.cpp server, vLLM and similar local servers expose OpenAI-compatible endpoints and are free to run.': 'LM Studio, llama.cpp, vLLM et serveurs locaux similaires sont compatibles OpenAI et gratuits.',
  'Remove provider': 'Supprimer le fournisseur', 'models': 'modèles',
  'Only show free models (local Ollama + cloud models priced at $0)': 'Afficher seulement les modèles gratuits (Ollama local + modèles cloud à 0 $)',
  'paid models hidden': 'modèles payants masqués', 'show': 'afficher', 'price unknown': 'prix inconnu', 'Paid': 'Payant', 'Search models': 'Rechercher un modèle', 'Manage models': 'Gérer les modèles',
  // chat & composer
  'Attach file…': 'Joindre un fichier…', 'Attach folder…': 'Joindre un dossier…', 'Workspace overview': 'Vue du projet',
  'Start a new session': 'Nouvelle session', 'Switch to Ask mode (read-only)': 'Mode Question (lecture seule)', 'Switch to Build mode': 'Mode Construire', 'Switch to Plan mode': 'Mode Plan', 'Open settings': 'Ouvrir les paramètres',
  'Request changes': 'Demander des modifications', 'approved': 'approuvé', 'Show earlier messages': 'Afficher les messages précédents',
  'No model selected — open the model menu below or Settings → Models.': 'Aucun modèle choisi — ouvrez le menu des modèles ou Paramètres → Modèles.',
  'Explain the structure of this project': 'Explique la structure de ce projet', 'Find and fix the errors in this project': 'Trouve et corrige les erreurs de ce projet', 'Write tests for the main module': 'Écris des tests pour le module principal',
  'Create a complete Snake game using Python': 'Crée un jeu Snake complet en Python', 'Explain async/await in JavaScript': 'Explique async/await en JavaScript', 'Write a PowerShell script to rename photos by date': 'Écris un script PowerShell qui renomme les photos par date',
  'Task stopped.': 'Tâche arrêtée.', 'Step limit reached.': 'Limite d’étapes atteinte.', 'Task failed.': 'La tâche a échoué.',
  'Run in terminal': 'Lancer dans le terminal', 'Preview': 'Aperçu', 'Run file': 'Lancer le fichier',
  'Choose a project for this conversation': 'Choisir un projet pour cette discussion',
  'To apply code to a file, PTR AI needs a project folder. The conversation will move into the project you choose.': 'Pour appliquer du code à un fichier, PTR AI a besoin d’un dossier de projet. La discussion sera déplacée dans le projet choisi.',
  'Open another folder…': 'Ouvrir un autre dossier…', 'Create a new folder…': 'Créer un nouveau dossier…',
  'Apply to file (path relative to the project root):': 'Appliquer au fichier (chemin relatif au projet) :',
  // explorer, editor, terminal, git, changes
  'Search in files': 'Rechercher dans les fichiers', 'No results': 'Aucun résultat', 'Type @ in chat to attach a file': 'Tapez @ dans le chat pour joindre un fichier', 'Refresh': 'Actualiser',
  'Open a file from the explorer or press': 'Ouvrez un fichier depuis l’explorateur ou appuyez sur', 'Binary file — not shown.': 'Fichier binaire — non affiché.',
  'Toggle minimap': 'Afficher/masquer la minimap', 'Toggle word wrap': 'Retour à la ligne', 'Accept & write': 'Accepter et écrire', 'Diff': 'Diff',
  'Latest task': 'Dernière tâche', 'Task': 'Tâche', 'Modified files': 'Fichiers modifiés', 'Revert all': 'Tout annuler',
  'Commit message': 'Message de commit', 'Commit': 'Commit', 'Staged': 'Indexés', 'Stage all': 'Tout indexer', 'Recent commits': 'Commits récents', 'No commits yet.': 'Aucun commit.',
  'PTR AI never pushes, resets or deletes branches automatically.': 'PTR AI ne fait jamais de push, reset ou suppression de branche automatiquement.',
  'This folder is not a Git repository.': 'Ce dossier n’est pas un dépôt Git.', 'Download Git': 'Télécharger Git', 'Loading…': 'Chargement…',
  // palette
  'Type a command or search sessions…': 'Tapez une commande ou cherchez une session…', 'Search files by name…': 'Chercher un fichier par nom…', 'No files': 'Aucun fichier',
  'New session': 'Nouvelle session', 'Open project…': 'Ouvrir un projet…', 'New workspace…': 'Nouvel espace…', 'Go to file…': 'Aller au fichier…',
  'Toggle theme': 'Changer de thème', 'Show changes': 'Voir les modifications', 'Source control': 'Contrôle de source', 'Refresh models': 'Actualiser les modèles',
  // onboarding
  'Run models locally. Free, private, offline.': 'Modèles en local. Gratuit, privé, hors ligne.', 'Connect cloud models with an API key. Some are free.': 'Modèles cloud avec une clé API. Certains sont gratuits.',
  'Free models from the OpenCode team (limited without an account).': 'Modèles gratuits de l’équipe OpenCode (limités sans compte).',
  'Any OpenAI-compatible endpoint (OpenAI, Gemini, Groq, LM Studio…).': 'Tout service compatible OpenAI (OpenAI, Gemini, Groq, LM Studio…).',
  'Custom provider': 'Fournisseur personnalisé', 'Pick an existing folder on this PC': 'Choisir un dossier existant', 'Choose or create an empty folder': 'Choisir ou créer un dossier vide',
  'Just chat': 'Juste discuter', 'You can open a project later with Ctrl+O': 'Vous pourrez ouvrir un projet plus tard avec Ctrl+O', 'No model selected yet': 'Aucun modèle choisi',
  'Local-first AI coding agent. Your account and files stay on your machine unless you choose a cloud model.': 'Agent de code IA local. Votre compte et vos fichiers restent sur votre machine sauf si vous choisissez un modèle cloud.',
  // sidebar & misc
  'Active': 'En cours', 'Delete this conversation and its history? This cannot be undone.': 'Supprimer cette discussion et son historique ? Action irréversible.',
  'Interface error': 'Erreur d’interface', 'Reload': 'Recharger', 'Your conversations and files are safe. Reload the interface to continue.': 'Vos discussions et fichiers sont intacts. Rechargez l’interface pour continuer.',
  'Applied to': 'Appliqué à', "MCP lets PTR AI use the tools of other applications (Roblox Studio, databases, browsers, design tools…). Each server runs on your computer or at an address you trust. Tool calls follow your permission mode; destructive tools ask first in Auto mode.": "MCP permet à PTR AI d’utiliser les outils d’autres applications (Roblox Studio, bases de données, navigateurs, outils de design…). Chaque serveur tourne sur votre ordinateur ou à une adresse de confiance. Les appels d’outils suivent votre mode d’autorisation ; en mode Auto, les outils destructeurs demandent d’abord.", "detected on this computer": "détecté sur cet ordinateur", "not found": "introuvable", "Add": "Ajouter", "Servers": "Serveurs", "Import from Claude": "Importer depuis Claude", "Copies the MCP servers configured in Claude Desktop / Claude Code on this computer": "Copie les serveurs MCP configurés dans Claude Desktop / Claude Code sur cet ordinateur", "Add server": "Ajouter un serveur", "No MCP server yet.": "Aucun serveur MCP pour l’instant.", "Always ask": "Toujours demander", "Ask before every tool call of this server": "Demander avant chaque appel d’outil de ce serveur", "Restart": "Redémarrer", "Remove this MCP server?": "Supprimer ce serveur MCP ?", "read-only": "lecture seule", "can modify": "peut modifier", "tools": "outils", "MCP server(s) imported": "serveur(s) MCP importé(s)", "No new MCP server found in Claude": "Aucun nouveau serveur MCP trouvé dans Claude", "Name": "Nom", "Type": "Type", "Local program": "Programme local", "Remote (HTTP)": "Distant (HTTP)", "Command": "Commande", "Arguments": "Arguments", "Environment": "Environnement", "Secret headers": "En-têtes secrets", "Secret variables": "Variables secrètes", "Secrets are stored encrypted. Leave empty to keep the current ones.": "Les secrets sont stockés chiffrés. Laissez vide pour garder les actuels.", "Stored encrypted. Use for tokens and API keys.": "Stocké chiffré. Pour les jetons et clés API.", "Official Roblox Studio MCP server (StudioMCP). Open Roblox Studio with a place for the tools to act on it.": "Serveur MCP officiel de Roblox Studio (StudioMCP). Ouvrez Roblox Studio avec un jeu pour que les outils puissent agir dessus.", 'Proprietary — all rights reserved': 'Propriétaire — tous droits réservés', 'is available.': 'est disponible.', 'Download the new version': 'Télécharger la nouvelle version', 'Download': 'Télécharger', 'Official source (cannot be changed)': 'Source officielle (non modifiable)', 'Updates come only from the official PTR AI releases on GitHub. Every download is verified against its SHA-512 before it is installed.': 'Les mises à jour viennent uniquement des versions officielles de PTR AI sur GitHub. Chaque téléchargement est vérifié (SHA-512) avant installation.', 'Confirm': 'Confirmer', 'Overwrite': 'Écraser', 'Overwrite anyway?': 'Écraser quand même ?', 'Revert all changes from this task?': 'Annuler toutes les modifications de cette tâche ?', 'Commit staged files?': 'Valider les fichiers indexés ?', 'Remove this project from PTR AI?': 'Retirer ce projet de PTR AI ?', 'Its conversations are deleted from PTR AI; files on disk are not touched.': 'Ses discussions sont supprimées de PTR AI ; les fichiers sur le disque ne sont pas touchés.', 'Delete this model?': 'Supprimer ce modèle ?', 'You can download it again later.': 'Vous pourrez le retélécharger plus tard.', 'Enable': 'Activer', 'This file changed on disk since you opened it. Overwrite it with your version?': 'Ce fichier a changé sur le disque depuis son ouverture. L’écraser avec votre version ?', 'Discard unsaved changes?': 'Abandonner les modifications non enregistrées ?', 'Discard': 'Abandonner', 'Open a project to use the terminal.': 'Ouvrez un projet pour utiliser le terminal.', 'denied': 'refusé', 'Mode': 'Mode'
}

// Terms of Service + mandatory updates
const FR_LEGAL: Record<string, string> = {
  'Terms of Service': 'Conditions d’utilisation',
  'You must accept the Terms of Service to use PTR AI. If you decline, the app closes.': 'Vous devez accepter les conditions d’utilisation pour utiliser PTR AI. Si vous refusez, l’application se ferme.',
  'I have read and accept the Terms of Service': 'J’ai lu et j’accepte les conditions d’utilisation',
  'Accept and continue': 'Accepter et continuer', 'Decline and quit': 'Refuser et quitter', 'Read': 'Lire', 'Accepted on': 'Accepté le',
  'Update required': 'Mise à jour obligatoire',
  'A new version of PTR AI is available. You must install it to keep using the app.': 'Une nouvelle version de PTR AI est disponible. Vous devez l’installer pour continuer à utiliser l’application.',
  'Downloading the update…': 'Téléchargement de la mise à jour…',
  'The update is ready. Restart PTR AI to install it.': 'La mise à jour est prête. Redémarrez PTR AI pour l’installer.',
  'Quit PTR AI': 'Quitter PTR AI',
  'Updates are mandatory': 'Les mises à jour sont obligatoires',
  'When a new version is released, you must install it to keep using PTR AI. Checked at launch and every hour.': 'Quand une nouvelle version est publiée, vous devez l’installer pour continuer à utiliser PTR AI. Vérification au lancement puis toutes les heures.'
}


// Accounts (sign-up / sign-in)
const FR_AUTH: Record<string, string> = {
  'Create your account': 'Créez votre compte', 'Sign in': 'Connexion', 'Sign up': 'Inscription', 'Sign out': 'Se déconnecter', 'Sign out of your account?': 'Se déconnecter de votre compte ?',
  'Sign in to continue to PTR AI.': 'Connectez-vous pour continuer vers PTR AI.',
  'Create an account to start using PTR AI. It is stored only on this computer.': 'Créez un compte pour utiliser PTR AI. Il est stocké uniquement sur cet ordinateur.',
  'Username': 'Nom d’utilisateur', 'Email': 'E-mail', 'Username or email': 'Nom d’utilisateur ou e-mail', 'Password': 'Mot de passe', 'Confirm password': 'Confirmer le mot de passe',
  'Stay signed in on this computer': 'Rester connecté sur cet ordinateur', 'Create account': 'Créer le compte',
  'Already have an account?': 'Déjà un compte ?', 'No account yet?': 'Pas encore de compte ?',
  'Show password': 'Afficher le mot de passe', 'Hide password': 'Masquer le mot de passe',
  'Passwords do not match.': 'Les mots de passe ne correspondent pas.',
  'Username must be 3–32 characters (letters, numbers, . _ -).': 'Le nom d’utilisateur doit faire 3 à 32 caractères (lettres, chiffres, . _ -).',
  'Enter a valid email address.': 'Saisissez une adresse e-mail valide.',
  'Password must be at least 8 characters.': 'Le mot de passe doit faire au moins 8 caractères.',
  'Password is too long.': 'Le mot de passe est trop long.',
  'This username is already taken.': 'Ce nom d’utilisateur est déjà pris.',
  'An account with this email already exists.': 'Un compte avec cet e-mail existe déjà.',
  'Incorrect username/email or password.': 'Nom d’utilisateur/e-mail ou mot de passe incorrect.',
  'Too many attempts. Try again in a few seconds.': 'Trop de tentatives. Réessayez dans quelques secondes.',
  'You must sign in to your PTR AI account before using the app.': 'Vous devez vous connecter à votre compte PTR AI avant d’utiliser l’application.',
  'Passwords are stored as a salted hash on this computer, never in clear text.': 'Les mots de passe sont stockés sous forme de hachage salé sur cet ordinateur, jamais en clair.',
  'Weak': 'Faible', 'Fair': 'Moyen', 'Strong': 'Fort'
}

export type TKey = string
export function translate(lang: string, k: string): string {
  if (lang === 'fr') return fr[k] ?? FR_TEXT[k] ?? FR_LEGAL[k] ?? FR_AUTH[k] ?? en[k] ?? k
  return en[k] ?? k
}
export function useT() {
  const lang = useStore((s) => s.settings?.language ?? 'en')
  return (k: string) => translate(lang, k)
}
