# Bài 27 — Hardening và quản lý bản vá

[Mục lục](../README.md) · [← Bài 26](26-xac-thuc-va-mac.md) · [Bài 28 →](28-ansible.md)

## Mục tiêu

Cần bài 25–26. Xây baseline bảo mật gắn với mục đích máy, cập nhật có kiểm chứng và giữ khả năng quản trị khi đổi cấu hình.

## 1. Baseline theo vai trò

Máy proxy không cần cùng phần mềm/quyền với database. Liệt kê service, port, user, dữ liệu và đường quản trị cần thiết. Tắt thành phần không cần giảm attack surface nhưng phải biết dependency; gỡ package mù quáng có thể làm mất log hoặc đồng bộ thời gian.

Hardening cần khả năng duy trì: cấu hình được version control, người chịu trách nhiệm cập nhật và ngoại lệ có lý do. Một checklist dài không thay kiểm chứng service vẫn phục vụ và hệ thống vẫn restore được.

## 2. SSH và sudo

SSH host key giúp client nhận diện server; user key giúp server xác thực user. Xác minh fingerprint qua kênh tin cậy khi kết nối lần đầu. Cảnh báo host key thay đổi có thể do rebuild hợp lệ hoặc kết nối sai máy; không xóa known_hosts toàn bộ để bỏ qua.

Trước khi tắt password authentication, xác nhận key login hoạt động trong phiên mới và user thực hiện sudo được. Dùng `sshd -t` kiểm tra syntax, `sshd -T` xem cấu hình hiệu lực; `Match` block có thể thay hành vi theo kết nối. Tên service có thể là `ssh` hoặc `sshd` tùy distro.

Sudo rule phải xét cả argument và khả năng thoát shell của lệnh được cho phép. Cho chạy editor hoặc interpreter bằng root thường rộng hơn vẻ ngoài của tên lệnh. Dùng `visudo` để kiểm tra syntax thay vì ghi đè sudoers trực tiếp.

## 3. Lab: kiểm kê rồi lập thay đổi

```bash
sudo ss -lntup
systemctl list-unit-files --state=enabled
getent passwd
sudo -l
timedatectl status
```

Lập bảng mỗi listener: service, user, mục đích, mạng được phép và người sở hữu. Chọn một thay đổi nhỏ trên VM clone, ví dụ vô hiệu một service lab không còn dùng. Ghi trước/sau, cách rollback và thử service chính bằng curl.

Nếu đã cài SSH, kiểm tra key login trước rồi thử cấu hình qua file include phù hợp của distro. Chỉ reload sau syntax check; giữ console và phiên SSH hiện tại cho đến khi phiên mới thành công.

## 4. Quy trình bản vá

1. Kiểm kê version package, kernel đang chạy và service dùng chúng.
2. Đọc advisory chính thức của distro, xác định máy có thực sự bị ảnh hưởng.
3. Thử cập nhật trên clone với workload đại diện.
4. Chuẩn bị backup/rollback và cửa sổ thay đổi.
5. Cập nhật, restart/reboot khi cần, kiểm tra health và log.
6. Xác minh version đang chạy, không chỉ version đã cài.

Không quyết định chỉ theo số upstream vì distro có backport. Rollback package không tự đảo migration dữ liệu, nên thay đổi ứng dụng cần phối hợp bài 30.

## 5. Secret, audit và thời gian

Không lưu key/token trong Git hoặc command line có thể hiện qua process listing. Dùng cơ chế secret phù hợp, quyền file hẹp và rotation khi lộ. Đồng hồ sai làm khó phân tích incident và xác minh TLS; NTP đang bật chưa chắc đã sync, cần đọc trạng thái thực.

## 6. Kiểm tra đạt

Nộp baseline một máy và bằng chứng thay đổi đã rollback được. Giải thích vì sao tắt mọi log để tiết kiệm disk làm suy yếu khả năng điều tra, và vì sao SSH session cũ sống không chứng minh cấu hình mới cho phép login.

## Đọc thêm

`man sshd_config`, `man sudoers`, `man visudo`, `man timedatectl`; advisory chính thức của distro tại thời điểm cập nhật.
