# Bài 26 — Xác thực, capabilities và MAC

[Mục lục](../README.md) · [← Bài 25](25-service-firewall.md) · [Bài 27 →](27-hardening-va-ban-va.md)

## Mục tiêu

Cần bài 10, 15, 25. Xác định lớp nào đang từ chối truy cập, áp dụng quyền tối thiểu mà không tắt cơ chế bảo vệ toàn hệ thống.

## 1. Danh tính khác xác thực và phân quyền

NSS quy định cách tra cứu tên user/group và các cơ sở dữ liệu khác, qua cấu hình như `/etc/nsswitch.conf`. PAM tổ chức các bước xác thực, account, session và password cho chương trình có tích hợp. Có tên user qua NSS chưa có nghĩa user được phép đăng nhập; xác thực thành công cũng chưa có nghĩa được đọc mọi file.

DAC dựa vào UID/GID, mode và ACL. MAC như SELinux/AppArmor bổ sung policy bắt buộc theo mô hình riêng. SELinux thường dùng nhãn và domain/type; AppArmor thường mô tả quyền theo profile và đường dẫn. Không chuyển nguyên một cách sửa giữa hai hệ.

## 2. Capabilities và giới hạn đặc quyền

Capabilities tách một số quyền root thành các quyền nhỏ hơn. Process có nhiều tập capability và các quy tắc kế thừa khi exec. Cấp capability cho binary là thay đổi bảo mật của mọi người có thể chạy binary đó, nên cần đánh giá phạm vi.

`NoNewPrivileges=yes` ngăn exec làm tăng đặc quyền theo các cơ chế liên quan; nó không xóa mọi quyền đang có và không tự tạo sandbox hoàn chỉnh. Namespace, seccomp và MAC sẽ bổ sung ràng buộc khác ở bài 36.

## 3. Lab: chẩn đoán quyền service mẫu

```bash
getent passwd linuxlab
sudo -u linuxlab id
namei -l /srv/linux-lab-web/index.html
sudo -u linuxlab cat /srv/linux-lab-web/index.html
systemctl show linux-lab-http -p User -p Group -p NoNewPrivileges
```

Tạm chuyển file lab sang mode 0600 với owner root, gửi curl và quan sát lỗi phục vụ. Sau đó khôi phục 0644 và curl lại. Đây là lỗi DAC rõ ràng; thay SELinux mode không phải lời giải.

```bash
sudo chmod 0600 /srv/linux-lab-web/index.html
curl -i http://127.0.0.1:8080/index.html
sudo chmod 0644 /srv/linux-lab-web/index.html
curl --fail http://127.0.0.1:8080/index.html
```

## 4. Lab: nhận diện MAC đang dùng

```bash
sudo cat /sys/kernel/security/lsm
```

Nếu path không có, kiểm tra securityfs/quyền và tài liệu distro, không kết luận mọi bảo vệ đều tắt. Trên SELinux dùng `getenforce`, `ls -Z`, `ps -eZ`, audit log; trên AppArmor dùng `aa-status` và journal. Các công cụ này có thể cần package bổ sung và sudo.

Với SELinux, lỗi sau khi copy dữ liệu vào vị trí service có thể do nhãn. So sánh nhãn mong đợi bằng `matchpathcon`; dùng `restorecon` cho đường dẫn có policy đúng. Với đường dẫn tùy chỉnh, định nghĩa fcontext bền vững bằng công cụ distro thay vì chỉ `chcon`. Không tự tạo allow rule từ mọi denial mà chưa hiểu tại sao ứng dụng đòi quyền đó.

## 5. Mẹo và kiểm tra đạt

- “Root làm được” chỉ thu hẹp giả thuyết, không chứng minh cần chạy service bằng root.
- Mount read-only cũng gây lỗi ghi; kiểm tra bằng `findmnt -T` trước khi sửa ACL.
- Audit log có thể thiếu vì cấu hình logging/rate limit; thiếu log không loại trừ policy.
- Nộp cây quyết định: identity → DAC/ACL → mount → MAC → sandbox ứng dụng. Chứng minh service mẫu vẫn chạy với user riêng sau phục hồi.

## Đọc thêm

`man nsswitch.conf`, `man pam`, `man 7 capabilities`, `man 8 restorecon`; [Linux Security Modules](https://docs.kernel.org/admin-guide/LSM/index.html).
