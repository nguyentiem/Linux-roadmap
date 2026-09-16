# Bài 02 — Linux, GNU/Linux và bản phân phối

[Mục lục](../README.md) · [← Bài 01](01-nen-tang-may-tinh.md) · [Bài 03 →](03-kien-truc-linux.md)

## Mục tiêu và liên hệ

Sau bài 01, bạn đã biết vai trò hệ điều hành. Bài này phân biệt phần do kernel cung cấp với phần do bản phân phối lựa chọn, giúp dùng đúng hướng dẫn và package.

## 1. Kernel không phải toàn bộ hệ thống

Linux là kernel: quản lý tiến trình, bộ nhớ, thiết bị, mạng và các giao diện hệ thống. Để có môi trường sử dụng được còn cần init, thư viện, shell và ứng dụng. GNU cung cấp nhiều công cụ phổ biến như Bash và coreutils, nhưng hệ Linux không bắt buộc dùng toàn bộ GNU; hệ nhúng có thể dùng BusyBox và musl.

Distribution là cách tích hợp các thành phần đó thành hệ thống có bộ cài, repository, chính sách cập nhật và cấu hình mặc định. Hai distro có thể cùng kernel upstream nhưng mang bản vá, cấu hình và công cụ quản trị khác nhau.

## 2. Những lớp phiên bản cần phân biệt

| Lớp | Ví dụ nhận diện | Ý nghĩa |
|---|---|---|
| Distro | `/etc/os-release` | Họ hệ thống, tên và phiên bản bản phát hành |
| Kernel đang chạy | `uname -r` | Kernel thực sự được boot |
| Package | Công cụ package manager | Phiên bản phần mềm đã cài |
| Ứng dụng đang chạy | Lệnh version/API phù hợp | Có thể khác package mới cài nếu chưa restart |

Cập nhật package kernel thường không thay kernel đang chạy ngay; cần boot vào kernel mới. Distro có thể backport bản sửa vào phiên bản cũ, vì vậy số upstream thấp chưa đủ kết luận thiếu bản vá.

## 3. Repository và vòng đời

Repository là nguồn metadata và package có cơ chế xác minh. Package manager giải quyết dependency và ghi nhận file thuộc package nào. Trộn repository giữa các release có thể khiến bộ thư viện không tương thích.

Fixed release ưu tiên một nền tảng có vòng đời rõ; rolling release đưa thay đổi liên tục. Không có lựa chọn tốt cho mọi tình huống: cần xét driver phần cứng, ứng dụng, quy trình cập nhật và khả năng phục hồi của đội vận hành.

## 4. Lab: nhận diện trước khi làm theo hướng dẫn

```bash
cat /etc/os-release
uname -r
uname -m
ps -p 1 -o pid,comm,args
command -v apt
command -v dnf
command -v systemctl
```

Lệnh `command -v` trả mã khác 0 nếu công cụ không tồn tại; đó là kết quả quan sát hợp lệ. Ghi distro, architecture, kernel, PID 1 và package manager vào hồ sơ bài 01.

Tìm một hướng dẫn dành cho họ Debian và một hướng dẫn họ RPM. Không thực thi chúng ngay; chỉ xác định tên package, tên service và đường dẫn cấu hình khác nhau. Đầu ra là bảng đối chiếu ít nhất ba khác biệt.

## 5. Mẹo và lỗi thường gặp

- Không chọn package theo tên gần giống mà bỏ qua mô tả và nguồn.
- Một container có thể báo user space Debian nhưng `uname` trả kernel host khác hẳn máy Debian thông thường.
- Có file unit systemd không chứng minh systemd đang là PID 1.
- Đọc release notes trước nâng cấp lớn; lỗi tương thích thường nằm ở user space, cấu hình và ứng dụng chứ không chỉ kernel.

## 6. Tự kiểm tra

1. Vì sao `uname -r` không cho biết đầy đủ distro? **Nó nhận diện kernel, không toàn bộ user space.**
2. Cài kernel mới đã hoàn tất cập nhật hệ đang chạy chưa? **Chưa chắc; kiểm tra kernel sau reboot.**
3. Vì sao không đánh giá bản vá chỉ bằng số phiên bản upstream? **Distro có thể backport bản sửa.**

## Đọc thêm

Tra `man os-release`, `man uname`; đọc release notes và chính sách hỗ trợ chính thức của distro đã chọn.
