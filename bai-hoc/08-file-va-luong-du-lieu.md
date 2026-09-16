# Bài 08 — Thao tác file, pipe và redirect

[Mục lục](../README.md) · [← Bài 07](07-thu-muc-va-file.md) · [Bài 09 →](09-xu-ly-van-ban.md)

## Mục tiêu

Cần bài 06–07. Nắm cách ghép công cụ bằng luồng byte, tách dữ liệu khỏi lỗi và kiểm tra kết quả thực thi.

## 1. Ba file descriptor chuẩn

Một chương trình thường nhận FD 0 là stdin, FD 1 là stdout, FD 2 là stderr. Chúng có thể trỏ tới terminal, file hoặc pipe. Redirect do shell thiết lập trước khi chạy chương trình.

| Cú pháp | Tác dụng |
|---|---|
| `cmd > out` | Ghi stdout, tạo hoặc truncate file |
| `cmd >> out` | Append stdout |
| `cmd 2> err` | Ghi stderr riêng |
| `cmd < input` | Lấy stdin từ file |
| `a \| b` | Đưa stdout của a vào stdin của b |
| `cmd > out 2>&1` | Cho stderr đi cùng đích stdout đã đổi |

Thứ tự quan trọng: `2>&1 >out` sao chép đích stdout cũ sang stderr rồi mới đổi stdout. Pipe thông thường không tự nhận stderr.

## 2. Sao chép, đổi tên và xóa

`cp` tạo bản sao, `mv` đổi tên hoặc chuyển dữ liệu, `rm` bỏ liên kết tên. Đổi tên trong cùng filesystem có thể là cập nhật metadata; chuyển khác filesystem thường cần sao chép rồi xóa. Tính nguyên tử của rename không có nghĩa dữ liệu tự bền vững qua mất điện.

Khi chương trình còn mở file đã bị xóa tên, dữ liệu có thể vẫn chiếm dung lượng đến khi tham chiếu mở được giải phóng. Bài 39 sẽ dùng điều này để giải thích `df` và `du` lệch nhau.

## 3. Lab: tách kết quả và lỗi

```bash
mkdir -p "$HOME/linux-lab/streams"
cd "$HOME/linux-lab/streams"
printf 'alpha\nbeta\nalpha\n' > input.txt
cat input.txt missing.txt > output.txt 2> error.txt
result=$?
printf 'exit=%s\n' "$result"
cat output.txt
cat error.txt
sort input.txt | uniq -c | tee counts.txt
wc -l input.txt
```

`cat` vẫn ghi nội dung file hợp lệ nhưng trả exit code khác 0 vì file còn lại không tồn tại. Vì vậy “có output” không chứng minh toàn bộ lệnh thành công.

Thử trong subshell để không đổi shell làm việc:

```bash
( false | true; printf 'default=%s\n' "$?" )
( set -o pipefail; false | true; printf 'pipefail=%s\n' "$?" )
```

Mặc định Bash lấy status lệnh cuối pipeline. `pipefail` làm pipeline phản ánh lỗi ở thành phần trước; cần cân nhắc chương trình kết thúc sớm gây SIGPIPE.

## 4. Lỗi cần tránh

- Không dùng `sort input.txt > input.txt`: shell truncate đầu vào trước. Ghi file tạm rồi thay thế sau thành công.
- Không parse output `ls` để xử lý tên file tùy ý. Tên có thể chứa khoảng trắng hoặc newline; dùng `find -print0` và công cụ hỗ trợ NUL.
- Dùng `cp -a` khi cần giữ nhiều metadata, nhưng xác nhận quyền và khả năng filesystem đích; đây chưa phải chiến lược backup đầy đủ.

## 5. Kiểm tra đạt

Nộp `input.txt`, `output.txt`, `error.txt`, `counts.txt`, kèm giải thích exit code. Trả lời: vì sao redirect sai có thể mất dữ liệu dù chương trình chưa chạy? **Shell đã mở file với chế độ truncate.**

## Đọc thêm

`man bash` phần REDIRECTION; `man cp`, `man mv`, `man tee`, `man 7 pipe`.
