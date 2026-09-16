# Bài 03 — Kiến trúc Linux và vai trò các thành phần

[Mục lục](../README.md) · [← Bài 02](02-linux-va-distro.md) · [Bài 04 →](04-linux-va-rtos.md)

## Mục tiêu và liên hệ

Dựa trên bài 01–02, vẽ được đường đi ứng dụng → kernel → phần cứng và xác định subsystem có thể gây lỗi. Không cần hiểu source kernel ở giai đoạn này.

## 1. Hai miền thực thi

User space chứa ứng dụng, shell, dịch vụ và thư viện. Kernel space chứa mã đặc quyền quản lý tài nguyên chung. CPU và cơ chế bảo vệ bộ nhớ giới hạn thao tác của user space; ứng dụng không được tùy ý truy cập RAM của tiến trình khác hoặc lập trình thiết bị.

System call là điểm vào được kiểm soát. Kernel kiểm tra tham số và quyền, thực hiện yêu cầu rồi trả kết quả hoặc mã lỗi. Chuyển user/kernel mode không nhất thiết là context switch sang tiến trình khác: task hiện tại có thể tiếp tục chạy nhưng ở chế độ kernel.

Linux thường được mô tả là monolithic modular kernel. Nhiều subsystem và driver chạy trong cùng miền kernel, trong khi module cho phép bổ sung một số thành phần lúc chạy. Module không có mức cách ly như tiến trình user space; lỗi driver có thể ảnh hưởng cả máy.

## 2. Bản đồ subsystem

| Thành phần | Trách nhiệm | Dấu hiệu cần khảo sát |
|---|---|---|
| Scheduler | Chọn task runnable và CPU | Run queue, context switch |
| Memory manager | Mapping, page fault, reclaim | Page fault, pressure, OOM |
| VFS/filesystem | Tên file, inode, thao tác file | Quyền, mount, lỗi I/O |
| Block layer/driver | Gửi yêu cầu đến storage | Độ trễ, lỗi thiết bị |
| Network stack | Socket, routing, giao thức | Retransmission, drop |
| IPC | Pipe, signal, shared memory… | Chờ giao tiếp, deadlock |
| Security | Kiểm tra quyền và policy | Permission denied, audit |

Ở user space, init điều phối khởi tạo; daemon cung cấp chức năng nền; thư viện cung cấp API; package manager quản lý phần mềm. Desktop là lớp tùy chọn, không phải điều kiện để kernel hoạt động.

## 3. Theo một lần đọc file

```text
Shell phân tích câu lệnh
  → tạo/chạy chương trình cat
  → mở đường dẫn, kernel kiểm tra quyền và mount
  → đọc qua VFS/filesystem
  → page cache có dữ liệu? Nếu chưa, yêu cầu storage
  → chép dữ liệu về buffer ứng dụng
  → ghi ra stdout, ví dụ terminal
```

Không phải mỗi lần đọc đều truy cập đĩa. Một lần đọc cũng có thể bị chia thành nhiều yêu cầu I/O. Các lớp abstraction giúp chương trình dùng cùng API cho nhiều filesystem nhưng không làm chúng có đặc tính hiệu năng giống nhau.

## 4. Lab: ghép thành phần với bằng chứng

```bash
printf 'hello Linux\n' > /tmp/linux-architecture.txt
cat /tmp/linux-architecture.txt
ps -p 1 -o comm=
cat /proc/filesystems
cat /proc/modules | head
ls /sys/class
```

Ghi mỗi lệnh đang quan sát lớp nào. Nếu `/proc/modules` rỗng, không kết luận máy không có driver: driver có thể được build vào kernel. Xóa file lab bằng `rm /tmp/linux-architecture.txt` sau khi hoàn tất.

Đầu ra: sơ đồ đọc file và ba giả thuyết khi `cat` thất bại: đường dẫn không tồn tại, không đủ quyền, hoặc lỗi I/O. Ở bài 16 bạn sẽ kiểm chứng bằng `strace`.

## 5. Mẹo và tự kiểm tra

- “Mọi thứ là file” là cách ghi nhớ giao diện, không có nghĩa mọi đối tượng đều là regular file hoặc hỗ trợ cùng thao tác.
- Shell không phải kernel; terminal không phải shell.
- Hàm `strlen()` thường xử lý trong user space; `read()` thường đi vào kernel. Vì sao sự khác biệt này ảnh hưởng tracing?
- Context switch và mode switch khác gì? **Một bên đổi ngữ cảnh task, bên kia đổi mức thực thi; chúng có thể xảy ra độc lập.**

## Đọc thêm

Tra `man 2 intro`, `man 2 read`, `man 7 hier`; dùng [Linux Kernel Documentation](https://docs.kernel.org/) làm bản đồ tra cứu subsystem.
