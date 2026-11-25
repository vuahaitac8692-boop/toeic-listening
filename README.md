# English Listening V4 – Workers AI + Admin publishing

## Nội dung phiên bản sửa lỗi
- Admin tạo transcript tiếng Anh bằng Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo`.
- Tự động dịch tiếng Việt bằng `@cf/meta/m2m100-1.2b`, gom nhiều câu vào từng nhóm và gọi tuần tự để giảm số subrequests.
- Có nút **Dịch / dịch lại tiếng Việt** trong vùng chỉnh sửa Admin.
- Giữ timestamp, cho phép sửa câu Anh/Việt, xuất JSON/SRT và xuất bản audio + transcript lên GitHub.
- Không cần `OPENAI_API_KEY` và không gọi OpenAI API có tính phí.

## 1. Cập nhật Cloudflare Worker
1. Mở Cloudflare Dashboard → **Workers & Pages** → `english-listening-worker` → **Edit code**.
2. Mở file `worker/index.js` trong gói ZIP này, sao chép toàn bộ và thay nội dung Worker hiện tại.
3. Mở **Settings → Bindings** và xác nhận có Workers AI binding với Variable name chính xác là `AI`.
4. Mở **Settings → Variables and Secrets**, giữ các cấu hình:
   - `GITHUB_OWNER` = `vuahaitac8692-boop`
   - `GITHUB_REPO` = `toeic-listening`
   - `GITHUB_BRANCH` = `main`
   - Secret `GITHUB_TOKEN` = Fine-grained token có quyền Contents: Read and write trên repository này
   - Secret `ADMIN_PASSWORD` = mật khẩu Admin đang sử dụng
5. Không cần `OPENAI_API_KEY`, `TRANSCRIBE_MODEL` hoặc `TRANSLATE_MODEL` nữa.
6. Nhấn **Deploy**.

`worker/wrangler.toml` có khai báo `[ai] binding = "AI"` để tham khảo nếu triển khai bằng Wrangler.

## 2. Cập nhật GitHub Pages
1. Giải nén ZIP.
2. Trong repository `vuahaitac8692-boop/toeic-listening`, thay `index.html` và `app.js` bằng hai file trong thư mục `english-listening-v4/`.
3. Giữ nguyên `data/lessons.json` và thư mục `lessons/` hiện tại để không mất bài nghe đã xuất bản.
4. Commit/push lên nhánh `main`; GitHub Pages sẽ tự cập nhật.

## 3. Sử dụng Admin
1. Mở https://vuahaitac8692-boop.github.io/toeic-listening/ và đăng nhập Admin.
2. Tạo bài học, chọn MP3 (tối đa 25 MB), nhấn **Tạo Script Anh – Việt tự động**.
3. Kiểm tra các câu và timestamp. Nếu cần dịch lại, nhấn **Dịch / dịch lại tiếng Việt**.
4. Chỉnh sửa nội dung nếu cần rồi nhấn **Lưu bài học lên GitHub**.

## Giới hạn và lưu ý
- Worker xử lý các nhóm dịch tuần tự; mỗi nhóm tối đa 20 câu hoặc khoảng 2.600 ký tự. Có giới hạn bảo vệ 40 lượt dịch trong một lần chạy để tránh vượt ngưỡng subrequests.
- Audio lớn hơn 25 MB cần nén hoặc chia nhỏ trước khi tải lên.
- Cloudflare Workers AI sử dụng quota Neurons của tài khoản. Đây không phải API OpenAI trả phí, nhưng vẫn chịu giới hạn quota Workers AI của Cloudflare.
- Sau khi Deploy Worker và push hai file frontend, kiểm tra `/health` bằng cách đăng nhập Admin; nếu kết nối thành công, thử một file ngắn trước khi xử lý file dài.
