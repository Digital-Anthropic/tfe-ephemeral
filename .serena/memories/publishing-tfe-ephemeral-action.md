# Publishing tfe-ephemeral Action to Digital-Anthropic

## Current State

**Repository**: Currently pointing to `git@github.com:actions/typescript-action.git` (template origin)

**Local Changes**: The action has been fully implemented with:
- Multi-workspace management
- Dependency resolution
- Create/Apply/Destroy/Delete operations
- Variable set support
- Full TFE API integration

**Status**: Code is ready but not yet committed or pushed to Digital-Anthropic org

---

## Step-by-Step Publishing Process

### Step 1: Create Repository on Digital-Anthropic

1. Go to https://github.com/Digital-Anthropic (or wunderfix if that's the target org)
2. Click "New repository"
3. Repository settings:
   - **Name**: `tfe-ephemeral`
   - **Description**: "GitHub Action to create and manage ephemeral Terraform Enterprise/Cloud workspaces"
   - **Visibility**: Public (required for GitHub Actions Marketplace)
   - **Initialize**: Do NOT initialize with README (we have existing code)
4. Click "Create repository"

### Step 2: Update Git Remote

```bash
cd /Users/dimitri/workspace/wunderfix/clones/tfe-ephemeral

# Remove current origin (template repo)
git remote remove origin

# Add new origin (your organization)
git remote add origin git@github.com:Digital-Anthropic/tfe-ephemeral.git

# Or if using wunderfix org:
git remote add origin git@github.com:wunderfix/tfe-ephemeral.git

# Verify
git remote -v
```

### Step 3: Prepare Code for Release

#### 3.1 Build the Distribution

```bash
# Install dependencies (if not already done)
npm install

# Run all checks and build
npm run all
```

This command runs:
- Format check (Prettier)
- Lint (ESLint)
- Test (Jest)
- Build (Rollup)
- Package (creates dist/)

#### 3.2 Verify dist/ is Committed

**CRITICAL**: GitHub Actions require the compiled `dist/` directory to be committed.

```bash
# Check if dist/ is in .gitignore
cat .gitignore | grep dist

# If dist/ is ignored, remove it from .gitignore
# dist/ should NOT be in .gitignore for GitHub Actions

# Stage all files
git add .

# Check what will be committed
git status
```

Expected files to commit:
- `src/` (all TypeScript source)
- `dist/` (compiled JavaScript)
- `action.yml` (action metadata)
- `package.json` and `package-lock.json`
- `README.md`
- `__tests__/` (tests)

#### 3.3 Update README

Before committing, update the README to reflect your organization:

```bash
# Edit README.md to remove template content and add:
# - tfe-ephemeral specific documentation
# - Usage examples
# - Configuration reference
```

Create a proper README (I can help with this in next step if needed).

### Step 4: Initial Commit and Push

```bash
# Commit all changes
git add .
git commit -m "feat: implement TFE ephemeral workspace manager

- Multi-workspace support with dependencies
- Create, apply, destroy, delete operations
- VCS integration with GitHub
- Variable and variable set management
- Topological sort for dependency resolution
- Full TFE API integration"

# Push to main branch
git push -u origin main
```

### Step 5: Create Initial Release

#### Option A: Using the Release Script (Recommended)

```bash
# Run the release script
./script/release
```

The script will:
1. Ask for a new version tag (e.g., `v1.0.0`)
2. Remind you to update `package.json` version
3. Create and push the tag
4. Create a major version tag (e.g., `v1`)

When prompted:
- Enter: `v1.0.0` for first release
- Confirm package.json has `"version": "1.0.0"`

#### Option B: Manual Tagging

```bash
# Update package.json version to 1.0.0
npm version 1.0.0 --no-git-tag-version

# Commit version bump
git add package.json package-lock.json
git commit -m "chore: bump version to 1.0.0"
git push

# Create and push tags
git tag -a v1.0.0 -m "Release v1.0.0 - Initial release"
git tag -a v1 -m "Release v1 - Major version 1"
git push origin v1.0.0
git push origin v1
```

### Step 6: Create GitHub Release

1. Go to `https://github.com/Digital-Anthropic/tfe-ephemeral/releases`
2. Click "Create a new release"
3. Fill in release details:
   - **Tag**: Select `v1.0.0` (or create it)
   - **Release title**: `v1.0.0 - Initial Release`
   - **Description**: 

```markdown
## 🎉 Initial Release

### Features

- 🏗️ **Multi-Workspace Management**: Create and manage multiple TFE workspaces
- 🔗 **Dependency Resolution**: Topological sort for workspace dependencies
- 🚀 **Full Lifecycle**: Create, Apply, Destroy, Delete operations
- 🔐 **VCS Integration**: Seamless GitHub repository integration
- 📦 **Variable Management**: Support for workspace variables and variable sets
- ⚡ **Smart Execution**: Parallel for create/delete, sequential for apply/destroy

### Usage

```yaml
- name: Manage TFE Workspaces
  uses: Digital-Anthropic/tfe-ephemeral@v1
  with:
    tfe-token: ${{ secrets.TFE_TOKEN }}
    organization-name: my-org
    config: |
      action: create
      workspaces:
        my-workspace:
          vcs:
            repository: owner/repo
            oauth-token-id: ot-xxxxx
          variables:
            environment: production
```

### What's New

- Initial implementation of TFE workspace manager
- Support for Terraform Cloud and Enterprise
- Comprehensive test coverage
- Full documentation

### Requirements

- GitHub Actions runner
- Terraform Cloud/Enterprise account
- OAuth token for VCS integration
```

4. Check "Set as the latest release"
5. Click "Publish release"

### Step 7: Verify Action Works

Create a test repository or use an existing one:

```yaml
# .github/workflows/test-tfe-ephemeral.yml
name: Test TFE Ephemeral

on:
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Test TFE Action
        uses: Digital-Anthropic/tfe-ephemeral@v1
        with:
          tfe-token: ${{ secrets.TFE_TOKEN }}
          organization-name: wunderfix
          config: |
            action: create
            workspaces:
              test-workspace:
                vcs:
                  repository: wunderfix/mvpf-aws-network
                  oauth-token-id: ${{ secrets.TFE_OAUTH_TOKEN_ID }}
                variables:
                  name: test
                  cidr: "10.0.0.0/16"
```

---

## Choosing Organization: Digital-Anthropic vs Wunderfix

### Digital-Anthropic
**Pros**:
- Centralized tooling organization
- Reusable across multiple projects
- Professional/enterprise positioning

**Cons**:
- Need to ensure org exists and you have access
- Need to verify it's set up for public repos

**Recommendation**: Use this if it's a shared tools organization

### Wunderfix
**Pros**:
- Already exists
- You have access
- Works with existing TFE setup (organization: wunderfix)

**Cons**:
- Less discoverable if used across multiple orgs
- May be product-specific

**Recommendation**: Use this if the action is primarily for WunderFix infrastructure

### Decision Point
Based on your infrastructure setup showing `organization: "wunderfix"` in TFE configs, I recommend using **wunderfix** organization:

```bash
git remote add origin git@github.com:wunderfix/tfe-ephemeral.git
```

Then reference it in workflows as:
```yaml
uses: wunderfix/tfe-ephemeral@v1
```

---

## GitHub Actions Versioning Best Practices

### Semantic Versioning

Use SemVer for releases: `vMAJOR.MINOR.PATCH`

- **MAJOR** (v1, v2): Breaking changes
- **MINOR** (v1.1, v1.2): New features, backward compatible
- **PATCH** (v1.0.1, v1.0.2): Bug fixes

### Tag Strategy

Create two tags per release:
1. **Specific version**: `v1.0.0`, `v1.0.1`, `v1.1.0`
2. **Major version**: `v1`, `v2` (points to latest in major version)

Users can reference:
- `@v1` - Always gets latest v1.x.x (auto-updates with patches/features)
- `@v1.0.0` - Pinned to exact version (no updates)
- `@main` - Latest code (not recommended for production)

### Updating Releases

When releasing v1.0.1:
```bash
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin v1.0.1

# Update v1 tag to point to v1.0.1
git tag -fa v1 -m "Release v1"
git push origin v1 --force
```

---

## Post-Publishing Tasks

### 1. Update augrep-backend Workflow

Change the reference in your workflow:

```yaml
# Before
uses: wunderfix/tfe-ephemeral@v1

# After publishing, this will work
uses: wunderfix/tfe-ephemeral@v1
```

### 2. Create Documentation

Add comprehensive docs:
- `docs/usage.md` - Usage examples
- `docs/configuration.md` - Configuration reference
- `docs/api.md` - TFE API details

### 3. Add Examples

Create `examples/` directory with:
- `single-workspace.yml`
- `multi-workspace-with-dependencies.yml`
- `ephemeral-pr-environment.yml`

### 4. Setup GitHub Actions in Action Repo

Add CI/CD workflows in tfe-ephemeral repo:
- `.github/workflows/ci.yml` - Run tests on PRs
- `.github/workflows/linter.yml` - Lint code
- `.github/workflows/check-dist.yml` - Verify dist/ is up-to-date

These already exist from the template, verify they work.

### 5. Add Repository Topics

On GitHub, add topics:
- `github-actions`
- `terraform-cloud`
- `terraform-enterprise`
- `infrastructure-as-code`
- `devops`
- `ephemeral-environments`

### 6. Enable GitHub Pages (Optional)

If you create extensive docs, enable GitHub Pages for documentation site.

---

## Troubleshooting

### Issue: "dist/ directory not found"
**Solution**: 
```bash
npm run build
git add dist/
git commit -m "chore: add dist directory"
git push
```

### Issue: "Action not found"
**Causes**:
- Repository is private (must be public)
- Tag doesn't exist
- Wrong organization/repo name

**Solution**: Verify repo is public and tag exists

### Issue: "action.yml not found"
**Cause**: action.yml not in repository root

**Solution**: Ensure action.yml is in root directory, not subdirectory

### Issue: "Cannot force-push to protected branch"
**Solution**: 
- Temporarily disable branch protection
- Or manually delete and recreate tag via GitHub UI

---

## Quick Reference Commands

```bash
# Complete publishing flow
cd /Users/dimitri/workspace/wunderfix/clones/tfe-ephemeral

# 1. Setup remote
git remote remove origin
git remote add origin git@github.com:wunderfix/tfe-ephemeral.git

# 2. Build and test
npm run all

# 3. Commit everything
git add .
git commit -m "feat: implement TFE ephemeral workspace manager"

# 4. Push to remote
git push -u origin main

# 5. Create release
./script/release
# Enter: v1.0.0 when prompted

# 6. Verify
git tag -l
git log --oneline -5
```

---

## Next Steps After Publishing

1. ✅ Test the action in augrep-backend PR
2. 📝 Update ephemeral-network.yml workflow to use published action
3. 🧪 Create example workflows in tfe-ephemeral repo
4. 📚 Write comprehensive README
5. 🏷️ Add GitHub topics and description
6. 🔄 Set up automated CI/CD for the action repo
7. 📢 Share with team

---

## Alternative: GitHub Packages

If you want to keep the action private, you can use GitHub Packages:

1. Keep repo private
2. Reference with full path: `wunderfix/tfe-ephemeral@v1`
3. Configure `GITHUB_TOKEN` permissions in workflows that use it

But for ease of use, **public repository is recommended**.
