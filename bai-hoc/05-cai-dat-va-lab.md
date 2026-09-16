# Bài 05 — Yêu cầu phần cứng, cài đặt và môi trường lab

[Mục lục](../README.md) · [← Bài 04](04-linux-va-rtos.md) · [Bài 06 →](06-terminal-va-shell.md)

## Mục tiêu và chuẩn bị

Hoàn thành bài 01–04. Chuẩn bị máy host có công cụ ảo hóa, ISO từ website chính thức và dung lượng trống. Mục tiêu là có VM có thể khôi phục để dùng xuyên suốt giáo trình.

## 1. Hiểu đúng yêu cầu phần cứng

Không có mức RAM hoặc dung lượng tối thiểu chung cho Linux. Cần tách hỗ trợ kiến trúc CPU của kernel, yêu cầu bộ cài/distro, driver thiết bị và workload ứng dụng. Một image cho ARM không chạy trực tiếp như binary x86-64; giả lập kiến trúc khác có thể cần QEMU emulation và chậm hơn nhiều.

Với lab CLI, có thể bắt đầu bằng 2 vCPU, RAM 2–4 GB, disk 25–40 GB. Host RAM 16 GB và SSD trống khoảng 100 GB thuận tiện cho lab nhỏ; nhiều VM hoặc build kernel nên dự trù thêm. Đây là ngân sách học tập, không phải cam kết tối thiểu của distro.

Kiểm tra virtualization được hỗ trợ và bật trong firmware. Nested virtualization chỉ cần khi guest phải chạy hypervisor tiếp; không bật chỉ vì đang dùng một VM thông thường.

## 2. Quy trình cài đặt

1. Chọn distro có tài liệu hỗ trợ phù hợp; bài lab mặc định Debian/Ubuntu, Bash và systemd.
2. Tải ISO và kiểm tra checksum so với giá trị chính thức. Nếu có chữ ký, xác minh bằng khóa và quy trình của nhà phát hành; checksum từ cùng nguồn bị sửa chưa đủ xác thực nguồn gốc.
3. Tạo VM, gắn ISO, chọn boot UEFI nếu hypervisor hỗ trợ. Chỉ cấp ổ ảo mới cho bài cài đặt.
4. Chọn cài server/CLI, tạo user thường có quyền sudo. Ghi hostname và cấu hình mạng.
5. Sau cài đặt, tháo ISO, boot lại từ ổ ảo và cập nhật package theo distro.
6. Tắt VM sạch, tạo snapshot `baseline-clean` và kiểm tra có thể phục hồi.

Snapshot lưu trạng thái ở thời điểm chụp nhưng không thay backup độc lập. Snapshot có RAM và snapshot chỉ có disk cũng khác nhau về cách khôi phục.

## 3. Mạng cho lab

NAT thường giúp VM truy cập Internet mà không mở trực tiếp toàn bộ service ra LAN. Host-only/internal network dùng cho giao tiếp lab. Bridged đưa VM vào mạng vật lý và cần hiểu DHCP, địa chỉ và quyền truy cập.

Giai đoạn đầu dùng console VM. Chỉ bật SSH khi đến bài mạng và đã hiểu user, key, firewall. Console là đường cứu hộ khi cấu hình mạng sai.

## 4. Lab: kiểm tra sau cài đặt

```bash
cat /etc/os-release
uname -r
id
sudo -v
findmnt /
df -h /
ip -br addr
ps -p 1 -o comm=
mkdir -p "$HOME/linux-lab"
```

Lưu hồ sơ cấu hình trong `~/linux-lab/machine.txt` bằng editor hoặc chuyển hướng sau bài 08. Xác nhận `/` nằm trên ổ ảo đúng, user không phải root, PID 1 là systemd nếu theo nhánh lab mặc định.

Thử tạo file marker trong home, khôi phục snapshot và kiểm tra marker biến mất. Chỉ thử khi không có dữ liệu cần giữ sau snapshot.

## 5. Lỗi thường gặp và kiểm tra đạt

- ISO còn gắn khiến VM quay lại bộ cài: kiểm tra boot order và tháo ISO.
- Guest thiếu mạng: xem card có gắn, loại NAT và địa chỉ IP; chưa vội sửa DNS.
- `sudo` không tồn tại hoặc user chưa có quyền: dùng console quản trị theo tài liệu distro để hoàn tất cài đặt.
- Host thiếu RAM: giảm số VM đang chạy; swap lớn không thay thế RAM về hiệu năng.

Đạt bài khi VM boot từ disk, user dùng sudo được, truy cập repository được và đã diễn tập restore snapshot. Giải thích được vì sao container không thay VM cho bài boot/kernel.

## Đọc thêm

[Debian Installation Guide](https://www.debian.org/releases/stable/amd64/index) và tài liệu hypervisor đang sử dụng. Kiểm tra kiến trúc và phiên bản của hướng dẫn trước cài đặt.
