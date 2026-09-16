# Bài 17 — Quản lý bộ nhớ và page fault

[Mục lục](../README.md) · [← Bài 16](16-system-call.md) · [Bài 18 →](18-ly-thuyet-lap-lich.md)

## Mục tiêu

Cần bài 01, 12, 16. Phân biệt virtual memory với RAM resident, hiểu cache/reclaim và đọc được tình trạng bộ nhớ của process.

## 1. Không gian địa chỉ không phải RAM đã dùng

Mỗi process có không gian địa chỉ ảo. Page table ánh xạ trang ảo tới trang vật lý hoặc trạng thái khác; MMU hỗ trợ dịch địa chỉ và quyền, TLB cache kết quả dịch. Page size phụ thuộc kiến trúc/cấu hình; dùng `getconf PAGESIZE`, không mặc định mọi máy đều 4 KiB.

Stack giữ frame gọi hàm và biến tự động; heap phục vụ cấp phát động, nhưng allocator có thể dùng nhiều mapping khác nhau. `malloc` thành công không có nghĩa mọi trang đã được chạm và có RAM backing riêng ngay lập tức.

## 2. Demand paging và copy-on-write

Khi truy cập trang chưa được thiết lập phù hợp, CPU phát sinh page fault. Kernel có thể xử lý bằng cấp trang, nối mapping cache hoặc đọc storage. Minor fault không cần tải dữ liệu từ storage theo định nghĩa thống kê thông thường; major fault cần I/O. Page fault hợp lệ khác segmentation fault do truy cập không được phép.

Sau fork, cha và con có thể chia sẻ trang read-only theo copy-on-write. Khi một bên ghi, kernel tạo bản riêng cần thiết. Do đó cộng RSS các process có thể đếm trùng trang dùng chung. PSS chia phần trang dùng chung theo số mapping để hỗ trợ ước lượng.

## 3. Cache, reclaim, swap và OOM

Page cache giữ dữ liệu file trong RAM. Clean file-backed page có thể được thu hồi và đọc lại; dirty page cần writeback trước khi giải phóng phù hợp. Anonymous memory không có file backing sẵn; swap cung cấp một nơi lưu khi được cấu hình.

`MemAvailable` ước lượng RAM có thể dùng thêm mà không phải swap nhiều, hữu ích hơn chỉ `MemFree`. Khi reclaim không đáp ứng hoặc chạm giới hạn cgroup, OOM có thể xảy ra. Host còn RAM không loại trừ OOM trong container.

## 4. Lab: reserve rồi chạm trang

Chỉ cần khoảng 64 MiB RAM dư. Chạy Python ở một terminal:

```python
import mmap
import os

size = 64 * 1024 * 1024
area = mmap.mmap(-1, size)
print("PID", os.getpid(), flush=True)
input("Quan sát trước khi touch; Enter để tiếp tục...")
page = os.sysconf("SC_PAGE_SIZE")
for offset in range(0, size, page):
    area[offset] = 1
input("Quan sát sau khi touch; Enter để kết thúc...")
area.close()
```

Terminal khác, thay PID bằng số chương trình in ra:

```bash
ps -p PID -o pid,vsz,rss,comm
cat /proc/PID/smaps_rollup
free -h
vmstat 1 5
```

`PID` là placeholder, phải thay trước khi chạy. Nếu kernel không có `smaps_rollup`, dùng `smaps`. Kỳ vọng RSS tăng sau khi ghi từng trang; con số không nhất thiết đúng 64 MiB vì runtime và mapping khác. Kết thúc chương trình để giải phóng vùng lab.

## 5. Mẹo và tự kiểm tra

- VSZ lớn không tự chứng minh memory leak. Cần xu hướng resident/anonymous và hành vi ứng dụng theo thời gian.
- Allocator giữ bộ nhớ để tái sử dụng nên giải phóng object không luôn làm RSS giảm ngay.
- NUMA chia RAM theo locality với CPU; RAM còn trống toàn máy không có nghĩa mọi truy cập đều cùng chi phí.
- Vì sao đọc file lần hai thường nhanh hơn? **Có thể do page cache, không phải thiết bị đã nhanh lên.**

## Đọc thêm

`man 5 proc`, `man 2 mmap`, `man 2 getrusage`, `man free`; [kernel memory management](https://docs.kernel.org/admin-guide/mm/index.html).
