# English Listening V4 – Audio only, mobile-first

## What changed
- Removed video upload and all lesson level/category fields.
- iPhone/iPad-friendly audio file picker (`audio/*`) for MP3/M4A/WAV and other supported formats.
- One button transcribes English with segment timestamps and translates each segment to Vietnamese.
- Edit English, Vietnamese and start time directly in the browser before publishing.
- Publish audio + transcript JSON + `data/lessons.json` directly to GitHub through a Cloudflare Worker. No need to upload files separately in GitHub on iPhone.
- API keys and GitHub token stay on the Worker, never in the GitHub Pages frontend.
- Transcript auto-scroll remains isolated inside its own scroll container.

## Important limits
- OpenAI transcription currently accepts files up to 25 MB. Supported formats include FLAC, MP3, MP4, MPEG, MPGA, M4A, OGG, WAV and WebM. Compress or split larger audio files before uploading.
- This Worker uses `whisper-1` because it returns segment timestamps required for synchronized sentence scrolling. OpenAI currently marks `whisper-1` deprecated with a scheduled shutdown on **2027-02-26**. Before that date, update the transcription/alignment implementation to a supported timestamp workflow. See https://developers.openai.com/api/docs/guides/speech-to-text
- Translation uses `gpt-4o-mini` through Chat Completions.
- GitHub Pages itself cannot write to a repository. The Worker performs authenticated GitHub Contents API writes.

## 1. Create a Cloudflare Worker
1. Open Cloudflare Dashboard → Workers & Pages → Create → Worker.
2. Deploy the contents of `worker/index.js` as the Worker entrypoint (or create a Worker and paste the file).
3. Set the variables from `worker/wrangler.toml`: `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, `TRANSCRIBE_MODEL`, `TRANSLATE_MODEL`.
4. Add these as **Secrets**, not plaintext vars:
   - `OPENAI_API_KEY`: your OpenAI API key with API billing enabled.
   - `GITHUB_TOKEN`: a fine-grained GitHub Personal Access Token limited to this repository, with **Contents: Read and write**.
   - `ADMIN_PASSWORD`: create a long unique password. This is required by the frontend to call the Worker.
5. Deploy and copy the Worker URL, e.g. `https://english-listening-worker.<your-subdomain>.workers.dev`.

Cloudflare secrets guide: https://developers.cloudflare.com/workers/configuration/secrets/
OpenAI speech-to-text guide: https://developers.openai.com/api/docs/guides/speech-to-text
GitHub Contents API: https://docs.github.com/en/rest/repos/contents

## 2. Configure the app on iPhone
1. Publish this folder to your new GitHub repository and enable GitHub Pages.
2. Open the Pages URL in Safari.
3. Scroll to **Kết nối dịch vụ**.
4. Paste the Worker URL and the `ADMIN_PASSWORD` you created; tap **Lưu cấu hình trên thiết bị này**.
5. Tap **Kiểm tra kết nối**. A success message means the app can reach the Worker.

The Worker URL is stored in localStorage; the admin password is kept in sessionStorage for the current browser session. If Safari closes the session, enter the password again.

## 3. Create a lesson on iPhone
1. Tap **Tạo bài học mới**.
2. Enter a title. The lesson ID is generated automatically; you may edit it.
3. Tap **Chọn file Audio** and choose the recording from Files or another iOS file source.
4. Tap **Tạo Script Anh – Việt tự động**. Keep Safari open while the file is uploaded, transcribed and translated.
5. Check/edit each English sentence, Vietnamese translation and start timestamp.
6. Tap **Lưu bài học lên GitHub**. The Worker uploads the audio and transcript and updates `data/lessons.json`.
7. Refresh the Pages website after deployment finishes (GitHub Pages may take a short time to update).

## 4. GitHub repository structure
```text
english-listening/
├── index.html
├── app.js
├── data/
│   └── lessons.json
└── lessons/
    └── lesson-id/
        ├── audio.mp3
        └── transcript.json
```

## 5. Security and cost
- Never put OpenAI API keys or GitHub tokens in `app.js`, `config.js`, HTML, or the public repository.
- Keep the GitHub token limited to one repository and Contents read/write only.
- Use a long, unique `ADMIN_PASSWORD`; do not share the Worker URL/password.
- Each transcription and translation consumes API usage and may incur charges. Review the audio and translation before publishing.
- This basic Worker does not implement user accounts or rate limiting. If the app is shared publicly, add Cloudflare rate limiting or Access before using it for a public multi-user service.
