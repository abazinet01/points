# Points — liste à points

Une app de poche pour gérer ses tâches avec le système *Final Version* de
Mark Forster. Œuvre dérivée de
[bsoule/dotlist](https://github.com/bsoule/dotlist) : l'algorithme en vient
directement, l'enveloppe a été refaite pour l'iPhone.

Pas de compte, pas de serveur, pas de suivi. Les tâches restent sur l'appareil.

> **Origine et crédits.** La méthode est de Mark Forster, l'algorithme vient de
> dotlist, et tout le code de ce dépôt a été écrit par Claude Code (Opus 5).
> Le détail de qui a fait quoi — et le statut de licence, qui demande à être
> clarifié — est dans [NOTICE.md](NOTICE.md). À lire avant de réutiliser ce
> code.

## La méthode en cinq lignes

1. Les nouvelles tâches s'ajoutent **en bas** de la liste.
2. La première tâche active porte un point ● : c'est le **repère**.
3. La **revue** descend la liste : *tu veux faire ça plus que le repère ?*
   Si oui, la tâche prend un point et devient le nouveau repère.
4. À la fin, on obtient une **chaîne** de tâches pointées, qu'on travaille
   **de bas en haut**.
5. Chaîne vide → la tâche suivante devient le nouveau repère. On recommence.

Le principe : on ne choisit jamais dans le vide, on compare toujours à quelque
chose de concret.

## Ce qui change par rapport au dotlist d'origine

- **Esthétique papier** : monochrome façon encre électronique, sans-serif
  système, coins nets, aucune ombre, transitions instantanées. Sans
  couleur pour porter la hiérarchie, la tâche en cours de comparaison s'affiche
  en **inversion** — un bloc d'encre pleine. Menu → *Apparence* rebascule vers
  la palette orange d'origine ; les deux suivent le mode clair/sombre du
  téléphone.
- **Pensée pour le pouce** : les décisions (Oui / Non / Terminé) vivent en bas
  de l'écran, cibles de 54 px. La liste défile au-dessus.
- **Installable** : plein écran sur l'écran d'accueil, sans barre Safari,
  fonctionne hors ligne, mode sombre automatique.
- **Historique** : les tâches terminées quittent la liste et vont dans un
  journal groupé par jour, avec compteurs. Une tâche « commencée, pas finie »
  y est marquée *repoussée*.
- **Sauvegarde** : export vers Fichiers/iCloud via la feuille de partage iOS,
  import, copie presse-papier. Un rappel discret apparaît si la dernière
  sauvegarde date de plus d'un mois.
- **Annulation** : terminer, supprimer ou repousser affiche un *Annuler*
  pendant quelques secondes.
- **Toucher une tâche** ouvre une feuille d'actions (terminer, faire
  maintenant, renvoyer en bas, renommer, supprimer).
- Le curseur de revue suit la tâche par son **identifiant**, pas par son index
  dans la liste — supprimer une tâche en pleine revue ne décale plus rien.

## Publier et installer sur l'iPhone

L'app a besoin d'une URL en HTTPS : iOS n'installe pas un fichier local, et le
mode hors ligne exige une origine sécurisée. GitHub Pages fait le travail
gratuitement.

Depuis ce dossier :

```bash
git init -b main && git add -A && git commit -m "Points — liste à points"
```

Crée ensuite le dépôt et publie (remplace `TON-COMPTE`) :

```bash
gh repo create points --public --source=. --push
```

Active GitHub Pages sur la branche `main`, dossier racine :

```bash
gh api -X POST repos/TON-COMPTE/points/pages -f source[branch]=main -f source[path]=/
```

Au bout d'une minute, l'app est sur `https://TON-COMPTE.github.io/points/`.
Sur l'iPhone : ouvre l'URL dans **Safari** (pas Chrome — seul Safari installe
les apps web sur iOS), touche **Partager** → **Sur l'écran d'accueil**.

> Le dépôt doit être public pour que Pages fonctionne sur un compte gratuit.
> C'est le *code* qui devient public, jamais tes tâches : elles ne quittent
> pas ton téléphone.

## Mettre à jour l'app

Modifie, pousse, puis **incrémente `CACHE` dans `sw.js`** — c'est ce qui dit à
l'iPhone de remplacer la version en cache. Sans ça, l'ancienne version peut
persister. La nouvelle version s'installe à la deuxième ouverture (la première
sert le cache et télécharge la mise à jour en arrière-plan).

## Où sont mes données ?

Dans le `localStorage` de l'appareil, sous la clé `points-v1`. Rien ne part
ailleurs. Conséquence directe : **iOS peut purger ce stockage**, et
désinstaller l'app l'efface. D'où l'export — c'est le seul vrai filet.

Le format d'import accepte aussi un export du `dotlist` d'origine : les champs
manquants sont comblés à la lecture.

## Développer en local

```bash
python3 -m http.server 8321
```

Puis `http://localhost:8321`. Le service worker met les fichiers en cache dès
la première visite ; pendant le développement, vide-le depuis les outils de
développement (Application → Service Workers → Unregister) sinon tu recharges
l'ancienne version.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure : barre du haut, liste, dock, feuilles, pages |
| `app.css` | Thèmes papier/couleur, clair/sombre, zones sûres iPhone |
| `app.js` | État, algorithme, rendu, sauvegarde — commenté par section |
| `sw.js` | Cache hors ligne |
| `manifest.webmanifest` | Nom, icônes, plein écran |
| `icons/` | Icônes générées (papier + point d'encre) |

## Bidouiller

- **Renommer l'app** : `short_name` dans `manifest.webmanifest`, plus la balise
  `apple-mobile-web-app-title` dans `index.html`.
- **Retoucher un thème** : les quatre blocs de variables en haut de `app.css`
  (papier clair/sombre, couleur clair/sombre). Au-delà des couleurs, les jetons
  `--font-read`, `--radius`, `--shadow` et `--anim` portent le reste de
  l'apparence.
- **Changer le thème par défaut** : `theme: 'paper'` dans `emptyState()`
  (`app.js`).
- **Reformuler la question de revue** : `renderPanel()`, bloc `reviewing`.
- **Refaire les icônes** : n'importe quel PNG carré aux tailles indiquées dans
  le manifeste, plus `icons/icon-180.png` pour iOS.

## Crédits

| | |
|---|---|
| **Méthode** *Final Version* | Mark Forster — [présentation](https://blog.beeminder.com/forster) |
| **Code d'origine** | [bsoule/dotlist](https://github.com/bsoule/dotlist) — algorithme, machine à états, forme des données |
| **Direction du projet** | [@abazinet01](https://github.com/abazinet01) — objectifs, choix fonctionnels et esthétiques |
| **Écriture du code** | Claude Code (Opus 5, Anthropic) — la totalité du code de ce dépôt |
| **Licence** | Aucune déclarée — voir [NOTICE.md](NOTICE.md) |
