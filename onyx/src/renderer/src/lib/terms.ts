// Terms of Service shown (and required) at first launch. Bump TOS_VERSION in src/shared/app.ts when this changes.
export interface TermsDoc { updated: string; sections: { h: string; p: string[] }[] }

export const TERMS: Record<'en' | 'fr', TermsDoc> = {
  en: {
    updated: 'Last updated: 22 November 2026',
    sections: [
      { h: 'Acceptance', p: [
        'These Terms of Service (“Terms”) govern your use of PTR AI (“the App”). By accepting them and using the App, you agree to be bound by them.',
        'If you do not agree, you must not use the App. The App cannot be used until these Terms are accepted.'
      ] },
      { h: 'The App and its licence', p: [
        'PTR AI is a desktop AI coding agent. It is licensed to you, not sold. You may download and use it for your own personal or professional work.',
        'All rights are reserved. You may not copy, modify, redistribute, sell, sublicense or build another product based on the App, nor reverse engineer it, except where the law expressly allows it despite this restriction.'
      ] },
      { h: 'AI-generated output', p: [
        'The App relies on AI models. Their answers, code and actions can be wrong, incomplete, insecure or unsuitable for your purpose.',
        'You are responsible for reviewing everything the App produces before you keep, run, publish or ship it. Never rely on the output alone for critical, legal, medical or safety-related decisions.'
      ] },
      { h: 'Files, commands and permissions', p: [
        'Depending on the permission mode you choose, the App can create, edit, move and delete files in your project folders and run commands on your computer. In “All” mode it does so without asking you first.',
        'You are responsible for the projects you open, for keeping backups, and for the permission mode you select. Only use broad permissions on projects you can afford to lose or have backed up.'
      ] },
      { h: 'Your data and privacy', p: [
        'The App works without an account and stores its data (settings, conversations, project list, encrypted keys) in a folder on your computer.',
        'When you use a cloud model provider, your messages and any file contents or command output the agent reads are sent to that provider and are subject to its own terms and privacy policy. With a local provider such as Ollama, inference stays on your machine.',
        'You keep ownership of your content and of the code you create with the App.'
      ] },
      { h: 'Third-party services', p: [
        'Model providers (Ollama, OpenRouter, OpenCode and others) and MCP servers or tools you connect are provided by third parties. Their availability, quality, pricing and terms are outside our control.',
        'You are responsible for your API keys, for any fees charged by providers, and for complying with their terms.'
      ] },
      { h: 'Mandatory updates', p: [
        'To keep the App secure and compatible, updates are mandatory. When a new version is published, the App tells you that it must be installed and does not let you continue until you have installed it.',
        'The App checks for updates at launch and regularly while it runs. If the update server cannot be reached, you may keep working until the next successful check.'
      ] },
      { h: 'Acceptable use', p: [
        'You agree not to use the App to break the law, to create or distribute malware, to infringe the rights of others, or to attack, overload or bypass the protections of the App or of third-party services.'
      ] },
      { h: 'No warranty', p: [
        'The App is provided “as is” and “as available”, without warranty of any kind, express or implied, including fitness for a particular purpose, accuracy, availability or absence of errors.'
      ] },
      { h: 'Limitation of liability', p: [
        'To the maximum extent permitted by law, the publisher of the App is not liable for any indirect or consequential damage, loss of data, loss of profit, or damage to files or systems resulting from the use of, or the inability to use, the App or its AI output.',
        'Nothing in these Terms limits any liability that cannot be limited by law, or any mandatory right you have as a consumer.'
      ] },
      { h: 'Changes and termination', p: [
        'These Terms may change. When they do, you will be asked to accept the new version before continuing to use the App.',
        'You may stop using the App at any time by uninstalling it. Access may be suspended if you breach these Terms.'
      ] }
    ]
  },
  fr: {
    updated: 'Dernière mise à jour : 22 novembre 2026',
    sections: [
      { h: 'Acceptation', p: [
        'Les présentes conditions d’utilisation (« Conditions ») régissent votre utilisation de PTR AI (« l’Application »). En les acceptant et en utilisant l’Application, vous acceptez d’y être lié.',
        'Si vous ne les acceptez pas, vous ne devez pas utiliser l’Application. Elle ne peut pas être utilisée tant que ces Conditions ne sont pas acceptées.'
      ] },
      { h: 'L’Application et sa licence', p: [
        'PTR AI est un agent de code IA de bureau. Il vous est concédé sous licence, il n’est pas vendu. Vous pouvez le télécharger et l’utiliser pour votre travail personnel ou professionnel.',
        'Tous droits réservés. Vous ne pouvez pas copier, modifier, redistribuer, vendre, sous-licencier l’Application ni créer un autre produit à partir d’elle, ni la décompiler, sauf lorsque la loi l’autorise expressément malgré cette restriction.'
      ] },
      { h: 'Contenus générés par l’IA', p: [
        'L’Application repose sur des modèles d’IA. Leurs réponses, leur code et leurs actions peuvent être faux, incomplets, non sécurisés ou inadaptés à votre besoin.',
        'Il vous appartient de vérifier tout ce que l’Application produit avant de le conserver, l’exécuter, le publier ou le livrer. Ne vous fiez jamais uniquement à ces résultats pour une décision critique, juridique, médicale ou liée à la sécurité.'
      ] },
      { h: 'Fichiers, commandes et autorisations', p: [
        'Selon le mode d’autorisation choisi, l’Application peut créer, modifier, déplacer et supprimer des fichiers dans vos dossiers de projet et exécuter des commandes sur votre ordinateur. En mode « Tout », elle le fait sans vous demander.',
        'Vous êtes responsable des projets que vous ouvrez, de vos sauvegardes et du mode d’autorisation choisi. N’utilisez des autorisations étendues que sur des projets que vous pouvez perdre ou que vous avez sauvegardés.'
      ] },
      { h: 'Vos données et votre vie privée', p: [
        'L’Application fonctionne sans compte et stocke ses données (réglages, conversations, liste de projets, clés chiffrées) dans un dossier sur votre ordinateur.',
        'Si vous utilisez un fournisseur de modèles dans le cloud, vos messages ainsi que le contenu des fichiers ou la sortie des commandes lus par l’agent sont envoyés à ce fournisseur et soumis à ses propres conditions et à sa politique de confidentialité. Avec un fournisseur local comme Ollama, le traitement reste sur votre machine.',
        'Vous restez propriétaire de vos contenus et du code que vous créez avec l’Application.'
      ] },
      { h: 'Services tiers', p: [
        'Les fournisseurs de modèles (Ollama, OpenRouter, OpenCode et autres) ainsi que les serveurs MCP ou outils que vous connectez sont fournis par des tiers. Leur disponibilité, leur qualité, leurs tarifs et leurs conditions échappent à notre contrôle.',
        'Vous êtes responsable de vos clés d’API, des frais facturés par les fournisseurs et du respect de leurs conditions.'
      ] },
      { h: 'Mises à jour obligatoires', p: [
        'Pour garder l’Application sûre et compatible, les mises à jour sont obligatoires. Lorsqu’une nouvelle version est publiée, l’Application vous indique qu’elle doit être installée et ne vous laisse pas continuer tant qu’elle ne l’est pas.',
        'L’Application recherche les mises à jour au lancement puis régulièrement. Si le serveur de mises à jour est injoignable, vous pouvez continuer à travailler jusqu’à la prochaine vérification réussie.'
      ] },
      { h: 'Usage acceptable', p: [
        'Vous vous engagez à ne pas utiliser l’Application pour enfreindre la loi, créer ou diffuser des logiciels malveillants, porter atteinte aux droits d’autrui, ou attaquer, surcharger ou contourner les protections de l’Application ou de services tiers.'
      ] },
      { h: 'Absence de garantie', p: [
        'L’Application est fournie « en l’état » et « selon disponibilité », sans garantie d’aucune sorte, expresse ou implicite, notamment d’adéquation à un usage particulier, d’exactitude, de disponibilité ou d’absence d’erreurs.'
      ] },
      { h: 'Limitation de responsabilité', p: [
        'Dans toute la mesure permise par la loi, l’éditeur de l’Application n’est pas responsable des dommages indirects ou consécutifs, de la perte de données ou de bénéfices, ni des dommages causés à des fichiers ou systèmes résultant de l’utilisation ou de l’impossibilité d’utiliser l’Application ou ses résultats d’IA.',
        'Rien dans ces Conditions ne limite une responsabilité qui ne peut être limitée par la loi, ni les droits impératifs dont vous disposez en tant que consommateur.'
      ] },
      { h: 'Modifications et résiliation', p: [
        'Ces Conditions peuvent évoluer. Dans ce cas, il vous sera demandé d’accepter la nouvelle version avant de continuer à utiliser l’Application.',
        'Vous pouvez cesser d’utiliser l’Application à tout moment en la désinstallant. L’accès peut être suspendu en cas de violation des Conditions.'
      ] }
    ]
  }
}
