# Bài 11 — Package, repository và thư viện

[Mục lục](../README.md) · [← Bài 10](10-user-va-phan-quyen.md) · [Bài 12 →](12-process-thread-signal.md)

## Mục tiêu

Cần bài 02 và quyền sudo. Hiểu package manager quản lý gì, tìm nguồn gốc executable và chuẩn bị công cụ cho các lab tiếp theo.

## 1. Từ repository đến file trên máy

Repository cung cấp metadata và package. Trên họ Debian, APT giải quyết dependency và tải package, còn dpkg quản lý việc cài và cơ sở dữ liệu package local. `apt update` cập nhật metadata; nó không đồng nghĩa đã nâng cấp phần mềm.

Chữ ký xác minh quan hệ tin cậy với nguồn package, không chứng minh phần mềm không có lỗi. Khi thêm nguồn, cần biết ai giữ khóa, nguồn dành cho release nào và chính sách pinning. Trộn release có thể kéo thư viện nền lên phiên bản không tương thích.

## 2. Executable và dynamic linking

Executable ELF có thể cần dynamic linker nạp shared library. Kernel bắt đầu chuỗi thực thi, loader giải quyết các đối tượng cần thiết trước khi vào mã chương trình. Static binary gói nhiều mã thư viện trong executable, còn dynamic binary chia sẻ thư viện và phụ thuộc tương thích ABI.

PATH dùng để tìm chương trình; đường tìm thư viện là cơ chế khác. Không sửa `LD_LIBRARY_PATH` toàn hệ thống để chữa một ứng dụng mà chưa hiểu thứ tự tìm và ảnh hưởng bảo mật. Với binary không tin cậy, tránh dùng `ldd`; dùng công cụ phân tích tĩnh như `readelf -d` trước.

## 3. Lab: kiểm kê và cài công cụ

Các lệnh dưới dành cho Debian/Ubuntu trong VM:

```bash
apt-cache policy python3
dpkg-query -S /usr/bin/python3
dpkg-query -W python3
sudo apt update
sudo apt install python3 curl strace build-essential binutils
command -v python3
readelf -l /usr/bin/python3 | head -n 30
```

APT có thể yêu cầu xác nhận; đọc danh sách cài/gỡ trước khi tiếp tục. Không tự thêm `-y` vào thao tác chưa hiểu. Một đường dẫn symlink có thể thuộc package khác với file đích; kiểm tra `readlink -f` nếu truy vấn không như mong đợi.

Với họ RPM, thực hành tương đương bằng `dnf info`, `rpm -qf`, `rpm -q`; tên nhóm compiler/package có thể khác. Không chạy cả hai nhánh trên cùng máy chỉ để hoàn thành lab.

## 4. Nâng cấp và rollback

Ghi phiên bản trước thay đổi, đọc release notes, thử trên clone/snapshot và xác định service cần restart. Package mới trên đĩa không khiến process cũ lập tức dùng toàn bộ mã mới. Downgrade package có thể không đảo ngược migration dữ liệu; rollback phải tính cả cấu hình và data.

Với Python, dùng môi trường ảo cho dependency dự án thay vì ghi đè thư viện do distro quản lý. Với binary cài thủ công, chọn prefix rõ và ghi lại cách cập nhật/gỡ.

## 5. Lỗi và tự kiểm tra

- Dependency conflict: kiểm tra nguồn và version policy trước khi ép cài.
- Không xóa file lock khi package manager còn chạy; xác định tiến trình giữ lock.
- Vì sao cập nhật package thành công nhưng CVE vẫn cần restart? **Process có thể còn dùng mapping mã cũ.**
- Vì sao xóa file executable không tương đương gỡ package? **Metadata, cấu hình và dependency vẫn còn.**

Đạt bài khi tìm được package sở hữu executable, nguồn version và thư viện cần nạp; lưu lại danh sách công cụ đã cài.

## Đọc thêm

`man apt`, `man apt-cache`, `man dpkg-query`, `man 8 ld.so`, `man readelf`.
