# Deploy Phantom with Claude Code

Copy the prompt below and paste it into a fresh Claude Code session. Claude will walk you through deploying a Phantom agent step by step.

## Prerequisites

Before starting, make sure you have:
- The Phantom repo cloned locally (`git clone https://github.com/ghostwright/phantom.git`)
- Specter installed and configured (`specter init` done, `specter image build` done)
- An Anthropic API key from console.anthropic.com
- A Slack workspace where you are an admin (or can install apps)

## The Prompt

Copy everything between the dashes and paste it into Claude Code:

---

I need you to help me deploy a Phantom agent. Phantom is an autonomous AI co-worker that runs on a VM and communicates via Slack. The repo is cloned at this location on my machine. You have access to all the files.

Before starting, read these files from the repo to understand the full context:
- `docs/deploy-checklist.md` - The detailed deployment guide
- `slack-app-manifest.yaml` - The Slack app manifest template
- `README.md` - Project overview

Please walk me through this interactively, one step at a time. Ask me for information when you need it. Do not proceed to the next step until the current one is confirmed.

Here is the deployment process:

## Step 1: Choose a name

Ask me what I want to name this Phantom agent. The name must be lowercase, letters/numbers/hyphens only. This becomes the subdomain (e.g., "scout" becomes scout.ghostwright.dev). Also ask me who this Phantom is for (their name, so we can personalize the Slack app).

## Step 2: Spin up a VM

Run this command with the name I chose:
```
specter deploy <name> --server-type cx53 --location fsn1 --yes --json
```

If the Specter binary is not in PATH, search for it on the local machine. Show me the output so I can see the IP and URL.

## Step 3: Create the Slack App

Tell me to do these steps manually (you cannot do them for me):

1. Go to https://api.slack.com/apps
2. Click "Create New App" > "From an app manifest"
3. Select my workspace
4. Switch to the YAML tab
5. Paste this manifest (read it from `slack-app-manifest.yaml` in the Phantom repo). Tell me to change the `name` field to "[Person's Name]s Phantom" (no apostrophe).
6. Click Create
7. Click "Install to Workspace" > Allow
8. Go to "OAuth & Permissions" in the sidebar and copy the "Bot User OAuth Token" (starts with xoxb-)
9. Go to "Basic Information" > "App-Level Tokens" > "Generate Token and Scopes"
   - Name it "socket"
   - Click "Add Scope" and select "connections:write"
   - Click "Generate"
   - Copy the token (starts with xapp-)

Ask me to paste each token as I get it. Confirm each one looks correct (xoxb- prefix for bot token, xapp- prefix for app token).

## Step 4: Get the owner's Slack User ID

Tell me to find the Slack User ID of the person who will own this Phantom:
- Click on their profile in Slack
- Click the three dots (more options)
- Click "Copy member ID"
- It looks like U followed by alphanumeric characters (e.g., UKWMQ41F0)

Ask me to paste it.

## Step 5: Get the Anthropic API Key

Ask me for the Anthropic API key (starts with sk-ant-). If I already have one from another deployment, I can reuse it.

## Step 6: Create the env file

Once you have all four values (API key, bot token, app token, owner user ID), create a file at `.env.<name>` in the Phantom repo directory:

```
ANTHROPIC_API_KEY=<the api key>
SLACK_BOT_TOKEN=<the bot token>
SLACK_APP_TOKEN=<the app token>
OWNER_SLACK_USER_ID=<the user id>
```

Show me the file (with secrets redacted) so I can confirm it looks right.

## Step 7: Fix SSH key if needed

Check if SSH works to the VM:
```
ssh -o ConnectTimeout=5 specter@<IP> "echo connected"
```

If it fails with a host key error, fix it:
```
ssh-keygen -R <IP>
```

## Step 8: Deploy Phantom to the VM

Run these commands in order. Stop if any fail and tell me.

```bash
# 1. Sync code (exclude config, data, env, evolved state)
rsync -az -e "ssh -o StrictHostKeyChecking=no" \
  --exclude='node_modules' --exclude='.git' --exclude='data' \
  --exclude='.env*' --exclude='local' --exclude='*.db' \
  <phantom-repo-path>/ specter@<IP>:/home/specter/phantom/

# 2. Copy env file
scp -o StrictHostKeyChecking=no \
  <phantom-repo-path>/.env.<name> \
  specter@<IP>:/home/specter/phantom/.env.local

# 3. Install dependencies
ssh -o StrictHostKeyChecking=no specter@<IP> \
  "cd /home/specter/phantom && bun install --production"

# 4. Start Docker services
ssh -o StrictHostKeyChecking=no specter@<IP> \
  "cd /home/specter/phantom && docker compose up -d"

# 5. Pull embedding model
ssh -o StrictHostKeyChecking=no specter@<IP> \
  "docker exec phantom-ollama ollama pull nomic-embed-text"

# 6. Initialize Phantom config
ssh -o StrictHostKeyChecking=no specter@<IP> \
  "cd /home/specter/phantom && rm -rf config/phantom.yaml config/channels.yaml config/mcp.yaml phantom-config/meta/version.json && source .env.local && PHANTOM_NAME=<name> bun run src/cli/main.ts init --yes"

# 7. Start Phantom
ssh -T -o StrictHostKeyChecking=no specter@<IP> << 'ENDSSH'
cd /home/specter/phantom
pkill -f bun 2>/dev/null || true
sleep 2
source .env.local
nohup bun run src/index.ts > /tmp/phantom.log 2>&1 &
sleep 8
tail -15 /tmp/phantom.log
ENDSSH
```

## Step 9: Verify

Check the logs from Step 8. Tell me:
- Does it say "Profiled owner: [Name]"?
- Does it say "Introduction sent as DM"?
- Does it say "[name] is ready"?
- Are there any errors?

Also verify the health endpoint:
```
curl -s https://<name>.ghostwright.dev/health
```

Tell me what it returns.

## Step 10: Confirm with the user

Tell me to check Slack. The person should have received a personalized DM from Phantom introducing itself. If they did, the deployment is complete.

Save the MCP admin token from the init output. It's needed to connect from Claude Code or other MCP clients.

## Important Notes

- Each Phantom needs its own Slack app (separate tokens per user)
- The owner_user_id controls who can interact with the Phantom (only that person)
- The Phantom DMs the owner directly on first start
- The env file (.env.<name>) contains secrets and must NOT be committed to git
- To update code later without losing data: rsync with --exclude='config' --exclude='phantom-config'

---

That's it. Paste everything between the dashes into Claude Code and it will walk you through the deployment interactively.
