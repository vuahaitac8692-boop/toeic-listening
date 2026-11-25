# Deploy Cloudflare Worker

1. Cloudflare Dashboard → Workers & Pages → Create Worker.
2. Create a Worker and replace its code with `index.js`.
3. In Settings → Variables and Secrets, add plain variables:
   - `GITHUB_OWNER` = your GitHub username or organization
   - `GITHUB_REPO` = `english-listening`
   - `GITHUB_BRANCH` = `main`
   - `TRANSCRIBE_MODEL` = `whisper-1`
   - `TRANSLATE_MODEL` = `gpt-4o-mini`
4. Add secrets:
   - `OPENAI_API_KEY` = OpenAI API key
   - `GITHUB_TOKEN` = fine-grained GitHub token limited to this repo, Contents read/write
   - `ADMIN_PASSWORD` = long unique password you choose
5. Deploy, copy the `workers.dev` URL and enter it in the app's settings.

Do not add the secrets to the GitHub repository or frontend source code.
