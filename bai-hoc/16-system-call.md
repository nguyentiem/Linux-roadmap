# Bài 16 — System call và vòng đời chương trình

[Mục lục](../README.md) · [← Bài 15](15-systemd-va-cuu-ho.md) · [Bài 17 →](17-quan-ly-bo-nho.md)

## Mục tiêu

Cần bài 03, 11–12 và C cơ bản. Phân biệt API thư viện với system call, đọc errno và dùng tracing để chứng minh chương trình đang làm gì.

## 1. Từ executable đến chương trình đang chạy

Shell yêu cầu chạy executable qua cơ chế tạo process và exec phù hợp. Với ELF động, kernel và dynamic loader thiết lập mapping cho chương trình/thư viện. Runtime chuẩn bị môi trường trước khi gọi `main`. Vì vậy trace của một chương trình đơn giản có nhiều thao tác ngoài logic bạn viết.

File descriptor là số nguyên trong bảng của process, tham chiếu tới đối tượng mở bên dưới. Hai FD có thể tham chiếu cùng open file description và chia sẻ offset, chẳng hạn sau `dup` hoặc `fork`. Đường dẫn là cách tìm đối tượng; FD giữ tham chiếu sau khi mở, ngay cả khi tên bị rename/unlink.

## 2. Lỗi và I/O từng phần

Các wrapper như `open` hoặc `read` thường trả `-1` và đặt `errno` khi lỗi. Chỉ đọc errno khi return value cho biết lỗi; lời gọi thành công không có nghĩa errno bị xóa. `read` trả 0 cho EOF trên regular file. `read`/`write` có thể xử lý ít byte hơn yêu cầu; chương trình tổng quát cần vòng lặp và xử lý EINTR.

`mmap` đưa vùng file hoặc bộ nhớ vào không gian địa chỉ; truy cập dữ liệu sau đó có thể gây page fault thay vì một `read` cho từng lần truy cập. Trace syscall vì thế không phải toàn bộ dòng hoạt động bộ nhớ.

## 3. Lab: chương trình đọc một khối

Lưu `read-one.c` trong `~/linux-lab/syscalls`:

```c
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>
#include <errno.h>

int main(int argc, char **argv) {
    if (argc != 2) return 2;
    int fd = open(argv[1], O_RDONLY);
    if (fd == -1) { perror("open"); return 1; }
    char buf[128];
    ssize_t n;
    do { n = read(fd, buf, sizeof buf); } while (n == -1 && errno == EINTR);
    if (n == -1) { perror("read"); close(fd); return 1; }
    ssize_t done = 0;
    while (done < n) {
        ssize_t w = write(STDOUT_FILENO, buf + done, (size_t)(n - done));
        if (w == -1 && errno == EINTR) continue;
        if (w <= 0) { perror("write"); close(fd); return 1; }
        done += w;
    }
    if (close(fd) == -1) { perror("close"); return 1; }
    return 0;
}
```

```bash
gcc -Wall -Wextra -O0 -g read-one.c -o read-one
printf 'syscall example\n' > sample.txt
strace -o trace.log -e trace=execve,openat,read,write,close ./read-one sample.txt
strace -o missing.log ./read-one no-such-file
```

Chương trình cố ý đọc tối đa một khối 128 byte, không phải bản thay thế `cat`. Wrapper `open` có thể xuất hiện thành `openat` trên hệ của bạn. Tìm dòng mở `sample.txt`, số FD, số byte đọc và write stdout. Trong trace lỗi, xác định ENOENT và đối chiếu return code.

## 4. Mẹo và kiểm tra đạt

- `strace -f` theo process con; attach vào process khác có thể bị giới hạn bởi quyền/ptrace policy.
- Trace có thể chứa đường dẫn, payload hoặc secret; chọn phạm vi và nơi lưu phù hợp.
- Một syscall chậm có thể bao gồm thời gian bị deschedule, không chỉ CPU thực thi trong kernel.
- Giải thích được vì sao thiếu file khác thiếu quyền và vì sao `open` trong source không nhất thiết trùng tên trong trace.

## Đọc thêm

`man 2 open`, `man 2 read`, `man 2 write`, `man 2 mmap`, `man 3 errno`, `man strace`.
