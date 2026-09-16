# Bài 12 — Tiến trình, thread và signal

[Mục lục](../README.md) · [← Bài 11](11-package-va-thu-vien.md) · [Bài 13 →](13-shell-scripting.md)

## Mục tiêu

Cần bài 08 và 11. Theo dõi vòng đời task, điều khiển tiến trình bằng signal và phân biệt kết thúc thực thi với thu hồi trạng thái.

## 1. Process và thread

Process là môi trường thực thi với không gian địa chỉ và tài nguyên. Các thread trong một process thường chia sẻ không gian địa chỉ và file descriptor nhưng có stack, thanh ghi và danh tính task riêng. Scheduler chọn task runnable; “một process” không nhất thiết tương ứng một đơn vị được lập lịch.

`fork()` tạo con với không gian địa chỉ riêng có cơ chế copy-on-write. `execve()` thay chương trình trong process hiện tại, không tự tạo PID mới. `wait()` giúp cha nhận exit status và thu hồi thông tin con đã kết thúc.

Zombie đã dừng chạy nhưng còn entry để cha nhận trạng thái; gửi SIGKILL không giúp vì nó đã chết. Orphan là process không còn cha ban đầu và được reparent đến cơ chế reaper phù hợp; nó vẫn có thể đang chạy.

## 2. Trạng thái và signal

`R` có thể đang chạy hoặc sẵn sàng chạy; `S` ngủ có thể ngắt; `D` thường là chờ không ngắt được; `T` bị stop; `Z` zombie. Không kết luận mọi `D` đều do đĩa hỏng: phải xem wait channel và stack khi có quyền.

SIGTERM yêu cầu kết thúc có cơ hội dọn dẹp. SIGINT thường đến từ Ctrl+C. SIGSTOP dừng và SIGCONT tiếp tục. SIGKILL và SIGSTOP không thể bị bắt hoặc bỏ qua. Signal có action mặc định nhưng ứng dụng có thể thay handler cho nhiều loại.

## 3. Lab: điều khiển một process

```bash
sleep 300 &
lab_pid=$!
ps -p "$lab_pid" -o pid,ppid,stat,etime,args
kill -STOP "$lab_pid"
ps -p "$lab_pid" -o pid,stat,args
kill -CONT "$lab_pid"
kill -TERM "$lab_pid"
wait "$lab_pid"
printf 'status=%s\n' "$?"
```

Trong Bash, status do signal thường được biểu diễn là 128 cộng số signal. Đây là quy ước shell cần đối chiếu, không phải mọi API đều trả cùng số nguyên theo cách đó.

## 4. Lab: ứng dụng dọn dẹp

Lưu thành `~/linux-lab/signals.py`:

```python
import signal
import time

running = True

def stop(signum, frame):
    global running
    running = False

signal.signal(signal.SIGTERM, stop)
print("ready", flush=True)
try:
    while running:
        time.sleep(0.2)
finally:
    print("cleanup complete", flush=True)
```

Chạy nền bằng `python3 ~/linux-lab/signals.py &`, lưu `$!`, gửi TERM và `wait`. Thử lại với KILL và so sánh: không kỳ vọng `finally` chạy khi bị KILL. Chỉ gửi signal tới PID vừa tạo và kiểm tra `ps` trước khi tác động.

## 5. Mẹo và kiểm tra đạt

- `jobs` chỉ biết job do shell hiện tại quản lý, khác `ps` nhìn process hệ thống.
- PID có thể được tái sử dụng; script lâu dài không nên xem PID cũ là định danh vĩnh viễn.
- `top -H` hoặc `ps -L` quan sát thread; số lượng thread cao không chứng minh song song hiệu quả.
- Giải thích được vì sao zombie cần sửa hành vi cha và vì sao SIGTERM thích hợp hơn KILL cho shutdown bình thường.

## Đọc thêm

`man 2 fork`, `man 2 execve`, `man 2 wait`, `man 7 signal`, `man ps`.
