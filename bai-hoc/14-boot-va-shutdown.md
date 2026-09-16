# Bài 14 — Toàn bộ quá trình boot và shutdown

[Mục lục](../README.md) · [← Bài 13](13-shell-scripting.md) · [Bài 15 →](15-systemd-va-cuu-ho.md)

## Mục tiêu

Cần kiến trúc bài 03, VM bài 05 và process bài 12. Xác định được máy đang hỏng ở tầng nào trước khi thay đổi bootloader hoặc filesystem.

## 1. Firmware và đường vào kernel

Sau reset, CPU bắt đầu theo cơ chế của kiến trúc. Firmware khởi tạo nền tảng, khám phá thiết bị và chọn mục boot. Với BIOS truyền thống, boot thường bắt đầu từ mã ở vùng boot của thiết bị. Với UEFI, firmware có thể nạp chương trình EFI từ EFI System Partition.

Bootloader như GRUB chọn kernel, truyền command line và có thể nạp initramfs. UEFI cũng có thể nạp kernel qua EFI stub hoặc một unified kernel image; vì vậy bootloader tách biệt không phải thành phần bắt buộc trong mọi đường boot. Secure Boot xác minh các thành phần theo chuỗi tin cậy, không thay cho mã hóa dữ liệu ổ đĩa.

## 2. Kernel và early user space

Kernel thiết lập bộ nhớ, interrupt, scheduler và subsystem, rồi khởi tạo driver theo cấu hình. Initramfs là archive root filesystem ban đầu trong RAM, thường chứa `/init` cùng công cụ/driver để tìm storage, mở LUKS, lắp RAID/LVM và chuẩn bị root thực.

Nếu driver storage/root filesystem cần thiết đã built-in và root có thể truy cập trực tiếp, một cấu hình có thể boot không cần initramfs. Thuật ngữ initrd thường được dùng trong tên công cụ/file dù cơ chế thực tế là initramfs.

Sau khi root thực sẵn sàng, early user space chuyển root và exec init thực. PID 1 tiếp tục vai trò quản lý user space; không hiểu đây là luôn tạo thêm một PID 1 mới.

```text
Reset → firmware → EFI/bootloader → kernel
  → early user space nếu cần → root thực → PID 1
  → filesystem và service theo dependency → login/ứng dụng
```

## 3. systemd và shutdown

systemd khởi động unit theo dependency, có thể song song. `default.target` chọn mục tiêu mặc định; graphical target có thêm lớp đồ họa, còn multi-user thường phục vụ chế độ nhiều user không cần desktop.

Shutdown dừng dịch vụ, cho ứng dụng kết thúc, xử lý process còn lại, đồng bộ/unmount filesystem và yêu cầu reboot/poweroff qua kernel. Rút điện bỏ qua các bước này. Journaling giúp recovery filesystem nhưng không đảm bảo mọi giao dịch ứng dụng chưa commit được giữ lại.

## 4. Lab: lập timeline boot thực tế

```bash
test -d /sys/firmware/efi && printf 'UEFI boot\n'
cat /proc/cmdline
findmnt /
ls -lh /boot
ps -p 1 -o pid,comm,args
systemd-analyze time
systemd-analyze critical-chain
journalctl -b -k --no-pager | head -n 60
```

Nếu không thấy `/sys/firmware/efi`, xem môi trường có phải container hoặc bị giới hạn trước khi kết luận firmware. `systemd-analyze` có thể không có timing firmware/loader; dữ liệu thiếu không có nghĩa giai đoạn đó không tồn tại.

Trong VM dùng GRUB, chụp snapshot rồi vào menu boot, sửa command line **chỉ cho lần boot đó** để bỏ `quiet` nếu có. Quan sát log và boot lại để trở về mặc định; không cần sửa file cấu hình lâu dài.

## 5. Khoanh vùng lỗi

| Triệu chứng | Điểm bắt đầu kiểm tra |
|---|---|
| Không có thiết bị boot | Firmware, boot order, ESP/bootloader |
| Kernel báo không mount được root | `root=`, driver, initramfs, UUID, LUKS/LVM |
| Vào emergency sau khi có root | `fstab`, mount phụ, unit thất bại |
| Có login nhưng ứng dụng không chạy | Service, quyền, cấu hình, dependency |

## 6. Kiểm tra đạt và đọc thêm

Nộp timeline có bằng chứng cho mỗi giai đoạn quan sát được. Giải thích initramfs khác `/boot` và vì sao lỗi service không nên chữa bằng cài lại GRUB.

Tra `man bootup`, `man kernel-command-line`, `man systemd-analyze`; [kernel initramfs](https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html).
