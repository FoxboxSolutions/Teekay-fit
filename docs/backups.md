# Sauvegardes et restauration

**Responsable :** le propriétaire / l'administrateur technique · **Test réel :** M11 · **Revue :** avant chaque lancement.

## Configuration

Base de données Supabase (un projet par environnement — voir `docs/environments.md`) :

| Environnement | Sauvegarde | Rétention cible |
| --- | --- | --- |
| Développement local | Aucune obligatoire (données jetables) ; export manuel `npx supabase db dump` avant migration risquée | au besoin |
| Préproduction | Sauvegardes automatiques Supabase (point-in-time recovery si activé sur le plan) | 7 jours |
| Production | **Sauvegardes automatiques quotidiennes + point-in-time recovery (PITR)** — à activer dans le dashboard Supabase du projet `teekayfit-prod` avant le lancement (M12) | 30 jours minimum |

### À configurer (checklist M12)

- [ ] Dashboard Supabase → projet production → **Database → Backups** : sauvegardes automatiques actives.
- [ ] **PITR** activé (objectif de rétention ≥ 7 jours).
- [ ] Les sauvegardes incluent la base **et** le stockage privé des PDF (bucket `STORAGE_BUCKET_PRIVATE`) :
      exporter le bucket (`supabase storage` / S3-compatible) vers un stockage chiffré externe, car les
      sauvegardes de base ne couvrent **pas** les objets.
- [ ] Chiffrement et accès aux sauvegardes : gestionnaire de secrets de l'hébergeur, jamais en Git.

## Procédure de restauration

### 1. Restauration base de données (PITR ou dump)

1. **Ne jamais** restaurer par-dessus une base saine : créer un nouveau projet ou une base de restauration isolée.
2. Via le dashboard Supabase : *Database → Backups → Restore* (point dans le temps souhaité).
3. Ou à partir d'un dump (`pg_dump` / `npx supabase db dump`).

### 2. Restauration depuis un dump

```bash
# Dump créé (exemple)
npx supabase db dump --db-url "$DATABASE_URL" --file backup_$(date +%F).sql

# Restauration (base cible vide ou isolée)
psql "$DATABASE_URL_CIBLE" -v ON_ERROR_STOP=1 -f backup_2026-10-29.sql
```

Après restauration :

- [ ] Vérifier les migrations appliquées : `select * from supabase_migrations.schema_migrations order by version desc limit 5;`
- [ ] Si le dump est antérieur à une migration : rejouer les migrations manquantes dans l'ordre.
- [ ] Resterouvrir le stockage privé (PDF) — voir §stockage ci-dessous.
- [ ] Régénérer les clés exposées éventuellement (annexe du PRD : renouveler en cas d'exposition).

### 3. Restauration du stockage privé (PDF)

1. Réimporter les objets du bucket privé dans le bucket cible (même chemins : la table `offer_files` référence `storage_path`).
2. Vérifier qu'aucun objet n'est public : `supabase.storage.from(bucket).list()` puis test anonyme.
3. Les liens signés restent à durée courte : aucune réinitialisation requise.

### 4. Validation après restauration (à réaliser — M11)

- [ ] Un client connecté voit **ses** commandes et **ses** PDF (test RLS après restauration).
- [ ] Un client ne voit **jamais** les données d'un autre (les tests `npm test` repassent).
- [ ] Les fichiers sont toujours privés (test d'accès par URL devinée → refus).
- [ ] Le journal d'audit conserve les entrées antérieures (ajout seul, non modifiable).
- [ ] Les comptes admin peuvent toujours se connecter (MFA intact — sinon procédure `docs/admin-mfa-recovery.md`).

## Fréquence de test

- **Test de restauration réel :** en M11, sur la préproduction, avec un jeu de données représentatif (≥ 1 commande complète).
- **Ensuite :** test documenté avant chaque lancement majeur, au moins annuellement.
- Chaque test laisse une trace (date, durée, résultat) dans le rapport M11.
