# Bài 34 — Debugging, tracing và crash analysis

[Mục lục](../README.md) · [← Bài 33](33-io-network-performance.md) · [Bài 35 →](35-dong-thoi-va-khoa.md)

## Mục tiêu

Cần bài 16, 31–33, C cơ bản. Chọn công cụ theo câu hỏi: process gọi gì, CPU chạy ở đâu, task chờ ở đâu, hoặc crash tại trạng thái nào.

## 1. Các góc quan sát

`strace` theo syscall/signal, hữu ích với lỗi file, quyền, socket. `perf` có thể lấy mẫu CPU và đếm sự kiện; CPU profile thường không thể hiện đầy đủ thời gian off-CPU. ftrace hỗ trợ tracepoint/function tracing trong kernel tùy config. eBPF cho phép logic quan sát tại các hook với kiểm tra và ràng buộc kernel, nhưng vẫn cần quyền, version và đánh giá overhead.

Symbol và debug information giúp đổi địa chỉ thành function/dòng source. Optimization có thể inline, bỏ biến hoặc đổi stack shape. Binary và debug symbols phải khớp build thực, không chỉ cùng tên file.

## 2. Lab GDB với chương trình chủ động abort

Cài GDB trong VM. Lưu `crash.c`:

```c
#include <stdlib.h>

static void process_request(int request_id) {
    if (request_id == 42) abort();
}

int main(void) {
    process_request(42);
    return 0;
}
```

```bash
gcc -Wall -Wextra -g -O0 crash.c -o crash-lab
gdb -q ./crash-lab
```

Trong GDB chạy `run`, `bt`, `frame`, `info locals`, `list`. Chọn frame `process_request` từ backtrace và đọc request_id. Đây là SIGABRT có chủ đích, không phải lỗi kernel. Thoát bằng `quit` và xác nhận dừng inferior nếu được hỏi.

Nếu muốn core dump, xem `ulimit -c` và `/proc/sys/kernel/core_pattern`. Hệ dùng systemd-coredump có thể tra bằng `coredumpctl`; hệ khác lưu theo pattern. Không chỉnh global core_pattern chỉ để làm theo một đường dẫn ví dụ.

## 3. Lab perf có giới hạn

Nếu kernel và quyền cho phép:

```bash
perf stat -- timeout 3s python3 -c 'while True: pass'
perf record -g -- timeout 3s python3 -c 'while True: pass'
perf report --stdio
```

Không có hardware counter trong VM là kết quả môi trường, không phải chứng minh không có CPU work. Nếu bị permission denied, xem perf policy và dùng VM được cấp quyền phù hợp; không hạ bảo vệ toàn host. Profile Python có thể cần tooling bổ sung để thấy stack ngôn ngữ đầy đủ.

## 4. Kernel oops, panic và kdump

Oops báo lỗi kernel nhưng máy có thể tiếp tục trong trạng thái bị ảnh hưởng; panic dừng theo cơ chế lỗi nghiêm trọng. Kdump dùng crash kernel được chuẩn bị để thu vmcore. Cần reserved memory, storage đích và thử quy trình trên máy lab riêng; không cố gây panic trên host đang làm việc.

Một báo cáo crash cần kernel version/config, module/taint, log đầy đủ, symbol khớp và bước tái tạo. Dòng cuối log chưa luôn là nguyên nhân đầu tiên.

## 5. Mẹo và kiểm tra đạt

- Tracing có thể làm biến mất hoặc thay đổi race do timing; so sánh với baseline.
- Core/vmcore có thể chứa secret và dữ liệu người dùng; giới hạn quyền và retention.
- Flame graph rộng nghĩa là nhiều sample theo cách đo, không tự chứng minh một hàm chậm mỗi lần gọi.
- Nộp backtrace có frame/biến, một kết quả perf hoặc giải thích hạn chế quyền, và bảng chọn công cụ cho CPU cao, chờ I/O, crash.

## Đọc thêm

`man gdb`, `man perf`, `man coredumpctl`; [ftrace](https://docs.kernel.org/trace/ftrace.html), [kdump](https://docs.kernel.org/admin-guide/kdump/kdump.html).
