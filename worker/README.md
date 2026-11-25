# Cloudflare Worker – English Listening

Worker dùng Cloudflare Workers AI để nhận dạng tiếng Anh và dịch tiếng Việt. Không cần `OPENAI_API_KEY`.

## Cấu hình

1. Trong Cloudflare Worker `english-listening-worker`, mở **Settings → Bindings**.
2. Thêm **Workers AI** binding với Variable name chính xác là `AI`.
3. Trong **Settings → Variables and Secrets**, giữ/cấu hình:
   - `GITHUB_OWNER` = `vuahaitac8692-boop`
   - `GITHUB_REPO` = `toeic-listening`
   - `GITHUB_BRANCH` = `main`
   - Secret `GITHUB_TOKEN` = Fine-grained token có quyền Contents: Read and write cho repo `toeic-listening`
   - Secret `ADMIN_PASSWORD` = mật khẩu Admin hiện tại
4. Không cần `OPENAI_API_KEY`, `TRANSCRIBE_MODEL` hoặc `TRANSLATE_MODEL`.
5. Mở **Edit code**, thay toàn bộ nội dung bằng `index.js` trong thư mục này, rồi nhấn **Deploy**.

## Endpoint

- `GET /health`
- `POST /transcribe` (multipart form field `audio`)
- `POST /translate` (JSON `{ "segments": [...] }`, dịch/dịch lại tiếng Việt trong Admin)
- `POST /publish` (multipart fields `title`, `id`, `audio`, `transcript`)
- `POST /rename` (JSON `{ "id": "...", "title": "..." }`)

`/transcribe` dùng `@cf/openai/whisper-large-v3-turbo` để tạo timestamp, sau đó dịch theo nhóm bằng `@cf/meta/m2m100-1.2b`. Các nhóm được xử lý tuần tự để giới hạn số lần gọi AI trong một Worker invocation.

Giới hạn file audio của ứng dụng là 25 MB. Nếu file vượt giới hạn hoặc quá dài, hãy chia nhỏ trước khi tải lên.
