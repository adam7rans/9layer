# Security Cleanup Guide

This document outlines safe, non-destructive steps to permanently remove committed SQLite database files from the repository history and prevent future leaks.

## 0) Preconditions and Safety
- Ensure all changes are pushed and CI is green.
- Inform collaborators: history will be rewritten; everyone must re-clone after the purge.
- Make a backup clone of the repo before proceeding.

## 1) Identify Sensitive Paths
We plan to purge:
- backend-ts/prisma/dev.db
- old_sqlite_backups/

Add more paths here if needed before running the purge.

## 2) Ensure .gitignore Blocks Future Commits
Already added:
- `*.db`
- `old_sqlite_backups/`

Verify with `git status` that no DB files are staged.

## 3) Purge Using git-filter-repo (Recommended)
Install:

```bash
brew install git-filter-repo   # macOS
# or
pipx install git-filter-repo   # Alternatively: pip install git-filter-repo
```

Run from the repository root:

```bash
# Dry run tip: clone a fresh copy and test there first.

git filter-repo \
  --invert-paths \
  --path backend-ts/prisma/dev.db \
  --path old_sqlite_backups/ \
  --force
```

Push rewritten history (force push):

```bash
git push origin --force --all
git push origin --force --tags
```

## 4) Alternative: BFG Repo-Cleaner
If you prefer BFG:

```bash
brew install bfg   # macOS

# Create a file list to delete
cat > bfg-delete-files.txt << 'EOF'
backend-ts/prisma/dev.db
old_sqlite_backups/
EOF

# Run BFG (operate on a bare mirror for safety)
repo_url=$(git config --get remote.origin.url)
rm -rf repo-mirror.git
git clone --mirror "$repo_url" repo-mirror.git
java -jar $(brew --prefix)/opt/bfg/libexec/bfg.jar --delete-files bfg-delete-files.txt repo-mirror.git
cd repo-mirror.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

## 5) Post-Purge Checklist
- Ask collaborators to re-clone:
  - "History was rewritten to remove sensitive files. Please re-clone the repository."
- Rotate any credentials if DB URLs/tokens had ever been committed (not detected here, but good practice).
- Revalidate deployments and CI after force push.

## 6) Optional: Pre-commit Guard (Manual Setup)
You can add a pre-commit hook to block DB files:

Create `.githooks/pre-commit`:

```bash
#!/usr/bin/env bash
set -euo pipefail

disallowed_patterns=("*.db" "old_sqlite_backups/*")

for pattern in "${disallowed_patterns[@]}"; do
  if git diff --cached --name-only | grep -E "$(echo "$pattern" | sed 's/\*/.*/g')" >/dev/null; then
    echo "[pre-commit] Blocked staging of files matching pattern: $pattern" >&2
    echo "Please remove these files from the commit: $(git diff --cached --name-only | grep -E "$(echo "$pattern" | sed 's/\*/.*/g')")" >&2
    exit 1
  fi
done
```

Activate hooks path:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

## Notes
- These commands are not executed automatically. Review and run them when ready.
- Test on a fresh clone to confirm the purge succeeds before force pushing to your primary remote.
