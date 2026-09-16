# Bài 21 — Storage stack và filesystem

[Mục lục](../README.md) · [← Bài 20](20-real-time-linux.md) · [Bài 22 →](22-lvm-raid-backup.md)

## Mục tiêu

Cần bài 07, 10, 17. Theo được đường đi từ tên file tới thiết bị và tạo filesystem trên một file image riêng, không đụng ổ hệ thống. Cần sudo, util-linux và e2fsprogs.

## 1. Các lớp lưu trữ

```text
Ứng dụng → VFS → filesystem → block layer
                    ↓
       LVM / mã hóa / RAID nếu có → driver → thiết bị
```

Partition chia không gian thiết bị; GPT/MBR mô tả các vùng đó. Filesystem tổ chức tên và dữ liệu bên trong một vùng lưu trữ. Có thể tạo filesystem trực tiếp trên block device không partition, nên partition không bắt buộc cho mọi cấu hình.

VFS cung cấp giao diện thống nhất. Inode chứa metadata và tham chiếu dữ liệu; directory ánh xạ tên tới inode; dentry hỗ trợ tra cứu tên trong kernel. Hard link là tên khác đến cùng inode trong cùng filesystem. Symlink chứa đường dẫn, có thể vượt filesystem và trỏ đích không tồn tại.

## 2. Mount và độ bền dữ liệu

Mount gắn filesystem vào cây tên. UUID thường ổn định hơn tên `/dev/sdX` nhưng clone disk có thể tạo UUID trùng; phải kiểm tra sau clone. Mount option như `ro`, `nodev`, `nosuid`, `noexec` giới hạn hành vi cụ thể, không thay chính sách bảo mật toàn diện.

ext4 và XFS phổ biến với journaling; Btrfs có copy-on-write, checksum và snapshot theo thiết kế của nó. Không suy ra mọi filesystem hỗ trợ cùng cách resize, repair hoặc snapshot. Journal chủ yếu giúp consistency theo bảo đảm filesystem, khác transaction consistency của database.

## 3. Lab: filesystem trong file image

Chạy trong VM, giữ cùng terminal để các biến còn tồn tại:

```bash
mkdir -p "$HOME/linux-lab/storage"
cd "$HOME/linux-lab/storage"
image_file=$(mktemp "$PWD/ext4.XXXXXX.img")
truncate -s 256M "$image_file"
lab_loop=$(sudo losetup --find --show "$image_file")
printf 'Image=%s Loop=%s\n' "$image_file" "$lab_loop"
sudo losetup "$lab_loop"
```

**Đối chiếu backing file đúng image vừa tạo trước bước format.** Không thay biến bằng tên disk host.

```bash
sudo mkfs.ext4 -F "$lab_loop"
lab_mount=$(mktemp -d /tmp/linux-fs.XXXXXX)
sudo mount "$lab_loop" "$lab_mount"
printf 'persistent data\n' | sudo tee "$lab_mount/a.txt" >/dev/null
sudo ln "$lab_mount/a.txt" "$lab_mount/b.txt"
ls -li "$lab_mount/a.txt" "$lab_mount/b.txt"
df -h "$lab_mount"
df -i "$lab_mount"
sudo umount "$lab_mount"
sudo losetup -d "$lab_loop"
rmdir "$lab_mount"
```

Hai tên phải có cùng inode và link count 2. Image còn giữ dữ liệu để gắn lại kiểm tra; khi không cần, xóa đúng `$image_file` sau khi đã detach. Nếu unmount báo busy, tìm process đang mở/chdir vào mount bằng `fuser -vm` hoặc `lsof`, thoát khỏi thư mục rồi thử lại.

## 4. Mẹo và lỗi thường gặp

- `df` phản ánh accounting filesystem; `du` đi qua cây file nhìn thấy. File đã unlink còn mở, mount che dữ liệu và reserved blocks có thể gây chênh lệch.
- Đủ byte nhưng hết inode vẫn không tạo thêm file được; kiểm tra `df -i`.
- Không dùng `fsck` sửa filesystem đang mount. Công cụ repair phụ thuộc loại filesystem và cần backup/ảnh đĩa khi dữ liệu quan trọng.

## 5. Kiểm tra đạt

Nộp sơ đồ storage của `/` bằng `lsblk -f`/`findmnt`, kết quả hard link và quy trình unmount/detach hoàn chỉnh. Giải thích vì sao filesystem không đồng nghĩa partition.

## Đọc thêm

`man mount`, `man fstab`, `man losetup`, `man 7 inode`, `man mkfs.ext4`.
