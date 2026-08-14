# Origine, crédits et statut de licence

Ce projet n'est pas une création originale. Trois apports distincts s'y
superposent, et ce fichier dit précisément qui a fait quoi.

## 1. La méthode — Mark Forster

Le système de priorisation mis en œuvre ici est **Final Version**, conçu par
Mark Forster. Rien de la méthode n'a été inventé pour ce projet : la règle du
repère, la revue comparative, la chaîne travaillée à rebours et la notion de
« commencé, pas fini » viennent toutes de lui.

- Présentation détaillée : <https://blog.beeminder.com/forster>
- Site de Mark Forster : <https://markforster.squarespace.com/>

Une méthode de travail n'est pas protégée par le droit d'auteur, mais la
citer est la moindre des choses.

## 2. Le code d'origine — bsoule/dotlist

Ce dépôt est une **œuvre dérivée** de
[bsoule/dotlist](https://github.com/bsoule/dotlist), une démonstration de
Final Version en un seul fichier `index.html`.

Ce n'est pas un fork GitHub au sens technique : les fichiers ont été récrits
plutôt que copiés puis modifiés. Mais la dérivation est réelle et il serait
malhonnête de la présenter comme une simple inspiration.

**Ce qui vient de dotlist :**

- L'algorithme complet et son organisation en fonctions —
  `activeTasks`, `chain`, `nextDotOrder`, `recomputeAnchor`,
  `nextCandidateIndex`, `benchmarkIndex` portent les mêmes noms et font la
  même chose.
- La machine à états à quatre modes : `empty`, `idle`, `reviewing`,
  `executing`.
- La forme des données : un objet unique en `localStorage`, des tâches
  décrites par `{ id, text, dotted, dotOrder, addedAt, doneAt }`.
- Le principe d'une application d'un seul tenant, sans dépendance ni build.

**Ce qui a été écrit pour ce projet :**

- Toute l'interface et les styles (structure HTML, mise en page au pouce,
  feuilles modales, thèmes papier et couleur).
- L'historique des tâches accomplies, l'export/import de sauvegarde,
  l'annulation des actions destructrices.
- L'installation en app iPhone : manifeste, service worker, zones sûres,
  gestion du clavier.
- Le suivi du curseur de revue par identifiant plutôt que par index.

## 3. Ce dépôt

- **Direction, choix fonctionnels et esthétiques, décision de publier :**
  [@abazinet01](https://github.com/abazinet01).
- **Écriture du code :** Claude Code (modèle Opus 5, Anthropic). L'intégralité
  du code de ce dépôt a été produite par un assistant IA, y compris ce fichier.

## Statut de licence — à clarifier

**dotlist est publié sans licence.** Un code sans licence reste, par défaut,
sous le droit d'auteur exclusif de la personne qui l'a écrit : la mise en ligne
publique n'emporte pas autorisation de réutiliser, modifier ou redistribuer.

Deux nuances, dans les deux sens :

- Le README de dotlist invite explicitement à enregistrer le fichier, le
  modifier, en faire sa propre version et la republier, et propose une liste
  de modifications à tenter. L'intention de partage ne fait aucun doute.
- Cette invitation n'est pas une licence formelle. Elle ne précise ni les
  conditions, ni la portée, ni la durée.

En conséquence, **aucune licence n'est déclarée sur ce dépôt** : on ne peut
pas concéder sur une œuvre dérivée des droits qu'on ne détient pas soi-même.
Le code est publié ici à titre personnel, avec attribution, et sera aligné sur
la licence de dotlist si celle-ci en reçoit une.

Si vous êtes à l'origine de dotlist et que cette réutilisation vous pose
problème, ouvrez une issue sur ce dépôt : le nécessaire sera fait sans
discussion.
