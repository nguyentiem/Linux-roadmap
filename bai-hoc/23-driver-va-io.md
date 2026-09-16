# Bài 23 — Driver, module và đường đi I/O

[Mục lục](../README.md) · [← Bài 22](22-lvm-raid-backup.md) · [Bài 24 →](24-mang-linux.md)

## Mục tiêu

Cần bài 03, 17, 21. Ghép thiết bị với driver, phân biệt module với firmware và hiểu khi nào dữ liệu đã thực sự bền vững.

## 1. Device model

Driver là mã điều khiển thiết bị và nối nó với subsystem kernel. Driver có thể built-in hoặc loadable module. Firmware là mã/dữ liệu được thiết bị hoặc nền tảng cần để hoạt động; cài module đúng nhưng thiếu firmware vẫn có thể khiến thiết bị không khởi tạo được.

sysfs phản ánh quan hệ device/bus/driver. udev ở user space xử lý sự kiện thiết bị và quy tắc đặt thuộc tính/symlink. Device node trong `/dev` là điểm truy cập, không phải toàn bộ driver. Không sửa permission node thủ công rồi kỳ vọng giữ qua reboot nếu udev sẽ tạo lại.

## 2. Interrupt và DMA trong đường I/O

Ứng dụng gửi yêu cầu; driver chuẩn bị buffer và descriptor; thiết bị có thể chuyển dữ liệu bằng DMA; completion báo qua interrupt hoặc cơ chế polling. Kernel và driver phải xử lý ownership, cache coherence theo nền tảng và vòng đời buffer.

I/O scheduler ở block layer tổ chức yêu cầu storage theo mục tiêu riêng, khác scheduler CPU. Thiết bị NVMe có nhiều queue nên số `%util` hoặc queue depth cần diễn giải theo kiến trúc thiết bị, không theo trực giác một disk chỉ làm một việc.

Một số lựa chọn thường gặp là `mq-deadline`, BFQ và `none`, tùy kernel/thiết bị. `mq-deadline` dùng cơ chế deadline và thứ tự để quản lý chờ của request, không phải policy CPU SCHED_DEADLINE. BFQ nhấn mạnh phân phối dịch vụ I/O theo ngân sách/công bằng. `none` bỏ lớp lập lịch I/O bổ sung ở vị trí đó, không có nghĩa thiết bị không có queue hoặc firmware không sắp xếp công việc. Chỉ lựa chọn hiển thị trong sysfs mới là lựa chọn đang khả dụng; benchmark workload thực trước khi đổi.

## 3. Buffered I/O, direct I/O và durability

Buffered write thường chép dữ liệu vào page cache rồi trả về trước khi thiết bị hoàn tất ghi. Writeback đẩy dirty page xuống storage. `fsync` yêu cầu đồng bộ dữ liệu và metadata cần thiết của file theo bảo đảm filesystem/thiết bị; để một tên file mới bền sau crash có thể cần sync cả directory theo quy trình ứng dụng.

Direct I/O giảm hoặc bỏ qua page cache cho phần dữ liệu theo hỗ trợ filesystem và ràng buộc alignment, nhưng không tự bảo đảm durable. `O_DIRECT` và `O_SYNC` giải quyết mục tiêu khác nhau.

## 4. Lab: truy vết thiết bị mà không tháo driver

```bash
lsmod | head
lsblk -o NAME,TYPE,MODEL,TRAN
ls /sys/class/block
ls /sys/class/net
```

Chọn tên block device từ output rồi thay `DEVICE` dưới đây:

```bash
udevadm info --query=all --name=/dev/DEVICE
readlink -f /sys/class/block/DEVICE/device/driver
cat /sys/class/block/DEVICE/queue/scheduler
```

Một số thiết bị ảo không có symlink driver ở vị trí này; lần theo sysfs parent bằng `udevadm info --attribute-walk` thay vì kết luận không có driver. Quan sát module bằng `modinfo TEN_MODULE` nếu driver là module. Không `rmmod` driver đang phục vụ root disk hoặc kết nối quản trị.

## 5. Lab: quan sát fsync

```bash
strace -e trace=openat,write,fsync,close python3 -c 'import os; f=open("/tmp/linux-io-lab.txt","w"); f.write("durability demo\n"); f.flush(); os.fsync(f.fileno()); f.close()'
rm /tmp/linux-io-lab.txt
```

`flush()` đẩy buffer Python tới kernel; `fsync()` là bước khác. Không dùng thử nghiệm này để kết luận phần cứng chống mất điện đạt yêu cầu; nó chỉ quan sát giao diện được gọi.

## 6. Kiểm tra đạt

Nộp một chuỗi device → sysfs → driver/module và giải thích write/flush/fsync. Vì sao không có module trong `lsmod` vẫn có thiết bị hoạt động? **Driver có thể built-in hoặc được cung cấp bởi lớp ảo khác.**

## Đọc thêm

`man udevadm`, `man modinfo`, `man 2 fsync`, `man 2 open`; [kernel driver model](https://docs.kernel.org/driver-api/driver-model/index.html).
