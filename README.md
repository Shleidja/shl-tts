# shl_tts

**shl_tts** est un script de Text-To-Speech (TTS) de proximité dynamique pour FiveM, qui se synchronise avec le script vocal `pma-voice`. Il a été conçu pour ajouter de l'interaction rp vocale synthétique d'une manière fun, sécurisée et ergonomique grâce à une interface NUI complète avec *Soundpad* intégré.

## 🌟 Fonctionnalités

- **TTS avec Atténuation 3D** : Le volume du TTS s'adapte à la distance entre les joueurs.
- **Synchronisation `pma-voice`** : Le script utilise automatiquement votre portée vocale actuelle de pma-voice pour déterminer jusqu'où votre TTS sera entendu (ex: chuchoter, parler, crier).
- **Interface NUI Stylisée** : Interface minimaliste, en mode sombre, pensée pour l'immersion.
- **Panneau Déplaçable & Verrouillable** : L'interface peut être glissée n'importe où sur l'écran. Sa position et son statut de verrouillage (`🔒 / 🔓`) sont sauvegardés via le LocalStorage.
- **Soundpad Intégré (3x3)** : Permet d'enregistrer et de ranger des phrases pré-configurées. Les presets sont persistants (LocalStorage).
- **Cooldown visuel natif** : Une barre de chargement se remplit pour empêcher le spam TTS intempestif.
- **Sécurité et Protection API** : Seuls les identifiants Discord préalablement "Whitelist" dans le fichier côté serveur ont accès. Les clients non autorisés verront purement et simplement les touches (et commandes) être désactivées pour prévenir l'abus.

## ⌨️ Raccourcis & Commandes (Modifiables en jeu)

Gérés via le mappage natif de FiveM (`RegisterKeyMapping`), chaque joueur peut changer ces touches dans : 
`Échap -> Paramètres -> Raccourcis Clavier -> FiveM`.

- **`F5` (Défaut)** : Ouvrir / Fermer le menu NUI complet.
- **`X` (Défaut)** : Arrêter la lecture TTS immédiatement pour soi et pour tout son auditoire.
- **`/tts [texte]`** : Commande alternative pour lancer un TTS sans ouvrir le menu.
- **`/ttsc`** : Commande alternative pour stopper le TTS en cours.

## 📦 Installation

1. Téléchargez ou clônez le répertoire dans votre dossier de ressources sous le nom `shl_tts`.
2. Ouvrez le fichier `server.lua`.
3. Éditez la table `WhitelistedDiscords` pour ajouter les ID Discord des admins / joueurs autorisés à s'en servir :

```lua
local WhitelistedDiscords = {
    ['votre_id_discord_ici'] = true, 
}
```

4. Dans votre fichier `server.cfg`, ajoutez pour démarrer la ressource :

```cfg
ensure shl_tts
```

## ⚙️ Dépendances

- **[pma-voice](https://github.com/AvarianKnight/pma-voice)** (La portée de la voix de synthèse dépend directement de la distance audio de votre personnage pma-voice).

## 📄 Configuration Avancée

Si vous souhaitez bidouiller les paramètres centraux, rendez-vous en haut du fichier `client.lua` :
```lua
local COOLDOWN_MS = 2500       -- Délai anti-spam (en millisecondes) entre 2 TTS.
local HEAR_SELF = true         -- Désactiver si vous ne voulez pas entendre votre propre TTS s'exécuter avec le cercle de distance.
local TTS_OPEN_KEY = 'F5'      -- Touche d'ouverture par défaut.
local TTS_STOP_KEY = 'X'       -- Touche d'arrêt par défaut.
```

Et dans `server.lua` :
```lua
local TTS_LANG = 'fr' -- Changer la langue de l'accent (ex: 'en', 'es', 'ja', etc...)
```
