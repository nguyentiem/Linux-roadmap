# Bài 22 — LVM, RAID, mã hóa và bảo vệ dữ liệu

[Mục lục](../README.md) · [← Bài 21](21-storage-filesystem.md) · [Bài 23 →](23-driver-va-io.md)

## Mục tiêu

Cần bài 21. Hiểu lớp ánh xạ storage, chọn cơ chế đúng cho mở rộng, chịu lỗi và khôi phục. Lab dùng file image riêng, cần `lvm2` và ext4 tools.

## 1. LVM hoạt động thế nào?

Physical volume (PV) đưa block device vào LVM; volume group (VG) gom extent từ PV; logical volume (LV) cấp một vùng block logic cho filesystem. Mở rộng LV chỉ mở rộng thiết bị logic; filesystem phải được mở rộng tương ứng để dùng thêm không gian.

Thin provisioning cho phép cấp dung lượng logic lớn hơn phần vật lý hiện dùng. Thin pool đầy có thể ảnh hưởng nhiều volume cùng lúc; cần cảnh báo data và metadata. Snapshot lưu trạng thái theo cơ chế của lớp đó nhưng cùng failure domain không tạo backup độc lập.

## 2. RAID và mã hóa

RAID 0 tăng phân bố dữ liệu nhưng không dự phòng; RAID 1 mirror; RAID 5/6 dùng parity; RAID 10 kết hợp stripe và mirror. Khả năng chịu hỏng phụ thuộc layout và tổ hợp disk hỏng, không chỉ tổng số disk. Rebuild làm tăng tải và giai đoạn rủi ro.

LUKS/dm-crypt bảo vệ dữ liệu ở trạng thái lưu trữ. Máy đã mở khóa vẫn có thể bị ứng dụng có quyền đọc dữ liệu. Mất khóa hoặc metadata cần thiết có thể làm dữ liệu không khôi phục được; quản lý recovery key là phần của thiết kế.

## 3. Lab: mở rộng LV ext4 trên một image

Trong VM dùng cùng terminal, xác nhận VG `coursevg` chưa tồn tại với `sudo vgs`:

```bash
mkdir -p "$HOME/linux-lab/lvm"
pv_image=$(mktemp "$HOME/linux-lab/lvm/pv.XXXXXX.img")
truncate -s 768M "$pv_image"
pv_loop=$(sudo losetup --find --show "$pv_image")
sudo losetup "$pv_loop"
```

Đối chiếu đúng backing file, sau đó mới chạy:

```bash
sudo pvcreate "$pv_loop"
sudo vgcreate coursevg "$pv_loop"
sudo lvcreate -L 192M -n data coursevg
sudo mkfs.ext4 /dev/coursevg/data
lv_mount=$(mktemp -d /tmp/linux-lvm.XXXXXX)
sudo mount /dev/coursevg/data "$lv_mount"
df -h "$lv_mount"
sudo lvextend -L +128M /dev/coursevg/data
sudo resize2fs /dev/coursevg/data
df -h "$lv_mount"
sudo lvs
```

Dung lượng filesystem phải tăng sau resize. XFS dùng công cụ grow khác và không hỗ trợ shrink như ext4; không đổi lệnh theo phỏng đoán. Nếu distro loại loop device khỏi LVM scan, không sửa global filter tùy tiện: dùng disk ảo rỗng chuyên dụng và xác minh nó trước mọi thao tác.

Cleanup sau khi kiểm tra không có dữ liệu cần giữ:

```bash
sudo umount "$lv_mount"
sudo lvremove /dev/coursevg/data
sudo vgremove coursevg
sudo pvremove "$pv_loop"
sudo losetup -d "$pv_loop"
rmdir "$lv_mount"
rm -- "$pv_image"
```

## 4. Backup và recovery objectives

RPO là lượng dữ liệu có thể mất tính theo thời gian; RTO là thời gian phục hồi chấp nhận được. Mirror không cứu file bị xóa đồng bộ; snapshot cùng disk không cứu disk chết. Backup cần bản sao độc lập, retention phù hợp và restore đã thử.

## 5. Tự kiểm tra

LV tăng mà `df` không tăng vì sao? **Filesystem chưa grow hoặc đang nhìn mount khác.** RAID có thay backup không? **Không; nó xử lý một số dạng hỏng thiết bị, không toàn bộ mất dữ liệu.** Nộp trước/sau resize cùng kế hoạch backup cho VG.

## Đọc thêm

`man lvm`, `man lvextend`, `man resize2fs`, `man md`, `man cryptsetup`.
