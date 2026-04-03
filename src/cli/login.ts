import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

/**
 * OAuth 2.0 PKCE login — VPS-friendly, no local server required.
 *
 * Flow:
 *   1. We print an authorization URL
 *   2. User opens it in any browser (on any device)
 *   3. After Google auth, browser redirects to localhost:51122/... → "This site can't be reached"
 *   4. User copies THAT URL from the browser address bar, pastes it here
 *   5. We extract the auth code and exchange it for tokens
 */

// OAuth client — set via PHANTOM_GOOGLE_CLIENT_ID and PHANTOM_GOOGLE_CLIENT_SECRET env vars
const CLIENT_ID = process.env.PHANTOM_GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.PHANTOM_GOOGLE_CLIENT_SECRET ?? "";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REDIRECT_URI = "http://localhost:51122/phantom-oauth-callback";
const SCOPES = [
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
];

function getTokensPath(): string {
	return path.join(os.homedir(), '.phantom', 'oauth.json');
}

function generatePKCE(): { verifier: string; challenge: string } {
	const verifier = crypto.randomBytes(64).toString('base64url');
	const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
	return { verifier, challenge };
}

function prompt(question: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

async function exchangeCode(code: string, verifier: string): Promise<{
	access_token: string;
	refresh_token: string;
	expires_in: number;
}> {
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			code,
			code_verifier: verifier,
			grant_type: 'authorization_code',
			redirect_uri: REDIRECT_URI,
		}),
	});
	if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
	return res.json() as any;
}

async function getUserEmail(accessToken: string): Promise<string | undefined> {
	try {
		const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		const data = await res.json() as { email?: string };
		return data.email;
	} catch {
		return undefined;
	}
}

function saveTokens(tokens: object): void {
	const dir = path.dirname(getTokensPath());
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	fs.writeFileSync(getTokensPath(), JSON.stringify(tokens, null, 2), { mode: 0o600 });
	console.log(`   Saved to: ${getTokensPath()}`);
}

export async function runLogin(_args: string[]): Promise<void> {
	const { verifier, challenge } = generatePKCE();
	const state = crypto.randomBytes(16).toString('hex');

	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		redirect_uri: REDIRECT_URI,
		response_type: 'code',
		scope: SCOPES.join(' '),
		code_challenge: challenge,
		code_challenge_method: 'S256',
		state,
		access_type: 'offline',
		prompt: 'consent',
	});

	const authUrl = `${AUTHORIZE_URL}?${params}`;

	console.log('\n🔐 Phantom Google Sign-In\n');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('Step 1: Open this URL in your browser:\n');
	console.log(authUrl);
	console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('Step 2: Sign in with Google and authorize Phantom.\n');
	console.log('Step 3: The browser will redirect to localhost and show');
	console.log('        "This site can\'t be reached" — that\'s NORMAL.\n');
	console.log('Step 4: Copy the FULL URL from your browser\'s address bar');
	console.log('        and paste it below.\n');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	const pasted = await prompt('Paste the redirect URL here: ');

	let code: string | null = null;
	let returnedState: string | null = null;
	try {
		const parsed = new URL(pasted);
		code = parsed.searchParams.get('code');
		returnedState = parsed.searchParams.get('state');
	} catch {
		throw new Error('Invalid URL pasted. Please copy the full URL from the browser.');
	}

	if (!code) throw new Error('No authorization code found in the URL.');
	if (returnedState !== state) throw new Error('State mismatch — please try again.');

	console.log('\nExchanging code for tokens...');
	const tokenData = await exchangeCode(code, verifier);
	const email = await getUserEmail(tokenData.access_token);

	const storedTokens = {
		access_token: tokenData.access_token,
		refresh_token: tokenData.refresh_token,
		expires_at: Date.now() + (tokenData.expires_in - 60) * 1000,
		email,
	};

	saveTokens(storedTokens);
	console.log(`\n✅ Signed in${email ? ` as ${email}` : ''}!`);
	console.log('\n   To use this auth, ensure your .env has:');
	console.log('   PHANTOM_PROVIDER=gemini-cli\n');
}
