# Bài 09 — Tìm kiếm, regex và xử lý văn bản

[Mục lục](../README.md) · [← Bài 08](08-file-va-luong-du-lieu.md) · [Bài 10 →](10-user-va-phan-quyen.md)

## Mục tiêu

Cần bài 08. Tạo pipeline phân tích log và biết khi nào phải dùng parser thay vì tách chuỗi thủ công.

## 1. Chọn công cụ theo phép biến đổi

`grep` lọc dòng theo mẫu, `sort` sắp xếp, `uniq` gộp các dòng trùng liền nhau, `cut` lấy trường đơn giản, `tr` đổi/xóa ký tự, `sed` chỉnh sửa theo dòng, `awk` xử lý trường và tổng hợp. `rg` thuận tiện tìm trong cây mã nguồn nhưng có mặc định bỏ qua một số file; đọc tùy chọn khi cần tìm toàn bộ.

`uniq` không tự tìm trùng toàn file: dữ liệu `a, b, a` cần sắp xếp trước nếu muốn gộp hai `a`. Locale ảnh hưởng thứ tự sort và character class; dùng `LC_ALL=C` cho tác vụ cần quy tắc byte ổn định, không mặc định dùng khi cần sắp xếp ngôn ngữ tự nhiên.

## 2. Regex và dữ liệu có cấu trúc

`^` và `$` neo đầu/cuối dòng, `.` khớp một ký tự, `*` lặp phần trước, `[0-9]` khớp chữ số. Extended regex qua `grep -E` hỗ trợ cú pháp như `+` và `|` trực tiếp. Quote regex để shell không mở rộng trước.

Regex không hiểu đầy đủ escaping/nesting của JSON. CSV có dấu phẩy trong trường quote nên `cut -d,` có thể sai. Chọn `jq` cho JSON, thư viện CSV cho CSV thực, parser tương ứng cho YAML.

## 3. Lab: thống kê log có schema rõ

```bash
mkdir -p "$HOME/linux-lab/text"
cd "$HOME/linux-lab/text"
cat > access.log <<'EOF'
10.0.0.1 GET / 200 12
10.0.0.2 GET /health 200 2
10.0.0.1 POST /orders 500 93
10.0.0.3 GET /missing 404 4
10.0.0.2 GET /orders 503 110
EOF
awk '$4 >= 500 {print $0}' access.log
awk '{count[$4]++} END {for (s in count) print s, count[s]}' access.log | sort -n
awk '{print $1}' access.log | sort | uniq -c | sort -nr
awk '{sum += $5; n++} END {if (n) print sum/n}' access.log
```

File ví dụ dùng whitespace làm dấu phân cách; schema là IP, method, path, status, latency_ms và không chứa khoảng trắng trong trường. Kết quả: hai dòng 5xx, status 200 xuất hiện hai lần, latency trung bình 44.2 ms. Không áp dụng số thứ tự trường này cho mọi access log.

Nếu có `jq`:

```bash
printf '%s\n' '{"status":200,"path":"/a b"}' '{"status":500,"path":"/orders"}' > access.jsonl
jq -r 'select(.status >= 500) | .path' access.jsonl
```

## 4. Mẹo và xử lý lỗi

- `grep` status 1 thường nghĩa là không có dòng khớp, khác status lỗi xử lý; script cần phân biệt.
- Regex không khớp có thể do CRLF; xem bằng `sed -n l file` trước khi sửa dữ liệu.
- `sort` có thể dùng file tạm và nhiều I/O trên dữ liệu lớn; dự trù không gian và tránh pipeline không giới hạn trên production.

## 5. Kiểm tra đạt

Tính tỷ lệ 5xx của fixture: **2/5 = 40%**. Thêm một dòng malformed và giải thích pipeline nào cần kiểm tra số trường. Viết lại phép thống kê trên JSONL bằng `jq` để tránh phụ thuộc vị trí trường.

## Đọc thêm

`man grep`, `man awk`, `man sort`; [jq manual](https://jqlang.org/manual/).
